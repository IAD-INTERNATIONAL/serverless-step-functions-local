const AWS = require('aws-sdk');

class ServerlessStepFunctionsOffline {
  constructor(serverless) {
    this.serverless = serverless;
    this.service = serverless.service;

    this.log = serverless.cli.log.bind(serverless.cli);
    this.config = (this.service.custom && this.service.custom['step-functions-offline']) || {};

    // Check config
    if (!this.config.accountId) {
      throw new Error('Step Functions Offline: missing accountId');
    }

    if (!this.config.region) {
      throw new Error('Step Functions Offline: missing region');
    }

    if (!this.config.stepFunctionsEndpoint) {
      this.config.stepFunctionsEndpoint = 'http://localhost:8083';
    }

    this.stepfunctionsAPI = new AWS.StepFunctions({
      endpoint: this.config.stepFunctionsEndpoint,
      region: this.config.region
    });

    this.hooks = {
      'offline:start:init': async () => {
        await this.getStepFunctionsFromConfig();
        await this.createEndpoints();
      }
    };
  }

  async getStepFunctionsFromConfig() {
    const parsed = this.serverless.configurationInput;
    this.stateMachines = parsed.stepFunctions.stateMachines;

    if (parsed.custom &&
      parsed.custom['step-functions-offline'] &&
      parsed.custom['step-functions-offline'].TaskResourceMapping
    ) {
      this.replaceTaskResourceMappings(
        parsed.stepFunctions.stateMachines,
        parsed.custom['step-functions-offline'].TaskResourceMapping
      );
    }
  }

  /**
    * Replaces Resource properties with values mapped in TaskResourceMapping
    */
  replaceTaskResourceMappings(input, replacements, parentKey) {
    for (const key in input) {
      if ({}.hasOwnProperty.call(input, key)) {
        const property = input[key];
        if (['object', 'array'].indexOf(typeof property) > -1) {
          if (input.Resource && replacements[parentKey]) {
            if (typeof input.Resource === 'string' && input.Resource.indexOf('arn:aws:states:::lambda:invoke') > -1) {
              input.Parameters.FunctionName = replacements[parentKey];
            } else {
              input.Resource = replacements[parentKey];
            }
          }

          // Recursive replacement of nested states
          this.replaceTaskResourceMappings(property, replacements, key);
        }
      }
    }
  }

  removeDistributedAttributes(definition) {
    for (const key in definition.States) {
      if (definition.States[key].Type == 'Map' && definition.States[key].ItemProcessor) {
        const processorConfig = definition.States[key].ItemProcessor.ProcessorConfig
        if (processorConfig && processorConfig.Mode === 'DISTRIBUTED') {
          const { MaxItemsPerBatch, BatchInput } = definition.States[key].ItemBatcher || {}
          const { Parameters, Resource, ReaderConfig } = definition.States[key].ItemReader || {}
          const { ItemsPath } = definition.States[key]

          delete definition.States[key].ItemBatcher
          delete definition.States[key].ItemReader
          delete definition.States[key].ItemProcessor.ProcessorConfig
          delete definition.States[key].MaxConcurrencyPath
          delete definition.States[key].Label
          delete definition.States[key].ItemsPath
          delete definition.States[key].ToleratedFailurePercentagePath

          const previousStateKey = Object.keys(definition.States).find(previousKey => {
            if (definition.States[previousKey].Type === 'Choice') {
              if (definition.States[previousKey].Default === key) {
                return true
              }

              return !!definition.States[previousKey].Choices.find(choice => choice.Next === key)
            }

            return definition.States[previousKey].Next === key
          })

          if (!previousStateKey) {
            throw new Error(`Unable to find previous state of "${key}"`)
          }

          const itemReaderMockState = {
            Type: 'Task',
            Resource: this.config.distributedMapResource,
            Parameters: {
              'Items.$': ItemsPath || '$',
              ...(Resource ? { ItemReader: { Parameters, Resource, ReaderConfig }} : {}),
              MaxItemsPerBatch,
              ...(BatchInput || {})
            },
            Next: key
          }

          const itemReaderMockStateKey = 'Prepare' + key
          definition.States[itemReaderMockStateKey] = itemReaderMockState
          if (!definition.States[previousStateKey]) {
            throw new Error(`Unable to find previous state "${previousStateKey}", only "${Object.keys(definition.States)}" available`)
          }

          if (definition.States[previousStateKey].Type === 'Choice') {
            definition.States[previousStateKey].Choices = definition.States[previousStateKey].Choices.map(choice => {
              if (choice.Next && choice.Next === key) {
                choice.Next = 'Prepare' + key
              }

              return choice
            })

            const choiceDefault = definition.States[previousStateKey].Default
            if (choiceDefault && choiceDefault === key) {
              definition.States[previousStateKey].Default = 'Prepare' + key
            }
          } else {
            definition.States[previousStateKey].Next = itemReaderMockStateKey
          }
        }

        definition.States[key].ItemProcessor = this.removeDistributedAttributes(definition.States[key].ItemProcessor)
      }
    }

    return definition
  }

  replaceAwsSdkCallToTaskMock(definition) {
    for (const key in definition.States) {
      if (definition.States[key].Type === 'Task') {
        if (definition.States[key].Resource === 'arn:aws:states:::aws-sdk:s3:getObject') {
          definition.States[key].Resource = this.config.awsSdkS3getObjectResource
        }

        if (definition.States[key].Resource === 'arn:aws:states:::aws-sdk:s3:putObject') {
          definition.States[key].Resource = this.config.awsSdkS3putObjectResource
        }
      }

      if (definition.States[key].Type == 'Map' && definition.States[key].ItemProcessor) {
        definition.States[key].ItemProcessor = this.replaceAwsSdkCallToTaskMock(definition.States[key].ItemProcessor)
      }
    }

    return definition
  }

  async createEndpoints() {
    for (const stateMachineName in this.stateMachines) {
      const definitionWithoutDistributionMap = this.removeDistributedAttributes(this.stateMachines[stateMachineName].definition)
      const definition = this.replaceAwsSdkCallToTaskMock(definitionWithoutDistributionMap)

      const endpoint = await this.stepfunctionsAPI.createStateMachine({
        definition: JSON.stringify(definition),
        name: this.stateMachines[stateMachineName].name || stateMachineName,
        roleArn: `arn:aws:iam::${this.config.accountId}:role/DummyRole`
      }).promise().catch(e => {

        if (e.name == 'StateMachineAlreadyExists') {
          const arn = e.message.replace('State Machine Already Exists: ', '').replaceAll('\'', '')
          return this.stepfunctionsAPI.updateStateMachine({
            stateMachineArn: arn,
            definition: JSON.stringify(definition),
            roleArn: `arn:aws:iam::${this.config.accountId}:role/DummyRole`
          }).promise().then(res => ({ ...res, stateMachineArn: arn }))

        }

        throw e
      });

      // Set environment variables with references to ARNs
      process.env[`OFFLINE_STEP_FUNCTIONS_ARN_${endpoint.stateMachineArn.split(':')[6]}`] = endpoint.stateMachineArn;
    }
  }
}

module.exports = ServerlessStepFunctionsOffline;
