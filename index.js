const AWS = require('aws-sdk');

class ServerlessStepFunctionsOffline {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.service = serverless.service;
    this.options = options;

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
            input.Resource = replacements[parentKey];
          }

          // Recursive replacement of nested states
          this.replaceTaskResourceMappings(property, replacements, key);
        }
      }
    }
  }

  async createEndpoints() {
    for (const stateMachineName in this.stateMachines) {
      const endpoint = await this.stepfunctionsAPI.createStateMachine({
        definition: JSON.stringify(this.stateMachines[stateMachineName].definition),
        name: stateMachineName,
        roleArn: `arn:aws:iam::${this.config.accountId}:role/DummyRole`
      }).promise();

      // Set environment variables with references to ARNs
      process.env[`OFFLINE_STEP_FUNCTIONS_ARN_${endpoint.stateMachineArn.split(':')[6]}`] = endpoint.stateMachineArn;
    }
  }
}

module.exports = ServerlessStepFunctionsOffline;
