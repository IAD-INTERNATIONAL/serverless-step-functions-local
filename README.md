# serverless-step-functions-offline

Run AWS step functions offline with Serverless!

On Serverless online start this plugin will create state machine defined on the serverless
configuration file.

This is a plugin for the [Serverless Framework](https://serverless.com/).

## Requirements

- serverless >= v2.32.0
- The [serverless-offline](https://www.npmjs.com/package/serverless-offline) plugin
- The [serverless-step-functions](https://www.npmjs.com/package/serverless-step-functions) plugin
- [AWS Step Functions local service](https://docs.aws.amazon.com/step-functions/latest/dg/sfn-local.html)

## Install

`npm install @IAD-INTERNATIONAL/serverless-step-functions-offline -D`

## Getting Started

You'll need to add this plugin to your `serverless.yml`.  The plugins section should look something like this when you're done:

```yaml
plugins:
  ...
  - serverless-step-functions
  - serverless-step-functions-offline
  - serverless-offline
  ...
```

Then, add a new section to `config` with `accountId` and `region` parameters:

```yaml
custom:
  step-functions-offline:
    accountId: 101010101010
    region: us-east-1
```

It also adds an environment variable for each created state machine that contains the ARN for it.  These variables are prefixed by `OFFLINE_STEP_FUNCTIONS_ARN_`, so the ARN of a state machine named 'WaitMachine', for example could be fetched by reading `OFFLINE_STEP_FUNCTIONS_ARN_WaitMachine`.

## Options

(These go under `custom.step-functions-offline`.)

- `accountId` (required) your AWS account ID
- `region` (required) your AWS region
- `stepFunctionsEndpoint` (defaults to `http://localhost:8083`) the endpoint for the AWS step functions local service
- `TaskResourceMapping` allows for Resource ARNs to be configured differently for local development

### Full Config Example

```yaml
service: offline-step-function

plugins:
  - serverless-step-functions
  - serverless-step-functions-offline
  - serverless-offline

provider:
  name: aws
  runtime: nodejs22.x

custom:
  step-functions-offline:
    accountId: 101010101010
    region: us-east-1
    TaskResourceMapping:
      FirstState: arn:aws:lambda:us-east-1:101010101010:function:hello
      FinalState: arn:aws:lambda:us-east-1:101010101010:function:hello
  sqsUrl: http://localhost:4566/101010101010/example-queue

functions:
  hello:
    handler: handler.hello

stepFunctions:
  stateMachines:
    WaitMachine:
      definition:
        Comment: "An example of the Amazon States Language using wait states"
        StartAt: FirstState
        States:
          FirstState:
            Type: Task
            Resource: Fn::GetAtt: [hello, Arn]
            Next: send_message
          send_message:
            Type: Task
            Resource: arn:aws:states:::sqs:sendMessage
            Parameters:
              QueueUrl: ${self:custom.sqsUrl}
              "MessageBody.$": "$"
            Next: wait_using_seconds
          wait_using_seconds:
            Type: Wait
            Seconds: 10
            Next: FinalState
          FinalState:
            Type: Task
            Resource: Fn::GetAtt: [hello, Arn]
            End: true
```
