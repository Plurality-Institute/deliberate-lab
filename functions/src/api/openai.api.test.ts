// eslint-disable-next-line @typescript-eslint/no-require-imports
import nock = require('nock');

import {
  ModelGenerationConfig,
  StructuredOutputType,
  StructuredOutputDataType,
  createStructuredOutputConfig,
} from '@deliberation-lab/utils';
import {getOpenAIAPIChatCompletionResponse} from './openai.api';
import {ModelResponse, ModelResponseStatus} from './model.response';

const DEFAULT_GENERATION_CONFIG: ModelGenerationConfig = {
  maxTokens: 300,
  stopSequences: [],
  temperature: 0.7,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  customRequestBodyFields: [{name: 'foo', value: 'bar'}],
};

describe('OpenAI-compatible API', () => {
  beforeEach(() => {
    nock('https://test.uri')
      .post('/v1/chat/completions')
      .reply(200, (uri, requestBody) => {
        return {
          id: 'test-id',
          object: 'text_completion',
          created: Date.now(),
          model: requestBody.model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify(requestBody),
                refusal: null,
                annotations: [],
              },
              logprobs: null,
              finish_reason: 'stop',
            },
          ],
        };
      });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  xit('handles chat completion request', async () => {
    const response: ModelResponse = await getOpenAIAPIChatCompletionResponse(
      'testapikey',
      'https://test.uri/v1/',
      'text-davinci-003',
      'This is a test prompt.',
      generationConfig,
    );

    expect(response.text).toEqual('test output');

    nock.cleanAll();
  });

  xit('handles text completion request with a current model using the shiny new responses api', async () => {
    nock('https://test.uri')
      .post('/v1/responses', (body) => body.model === 'test-model')
      .reply(200, {
        id: 'test-id',
        object: 'response',
        created: Date.now(),
        model: 'test-model',
        output: [
          {
            type: 'message',
            id: 'message-id',
            status: 'completed',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'test output',
                annotations: [],
              },
            ],
          },
        ],
      });

    // const generationConfig: AgentGenerationConfig = {
    //   temperature: 0.7,
    //   topP: 1,
    //   frequencyPenalty: 0,
    //   presencePenalty: 0,
    //   customRequestBodyFields: [{name: 'foo', value: 'bar'}],
    // };

    const response: ModelResponse = await getOpenAIAPITextCompletionResponse(
      'testapikey',
      'https://test.uri/v1/',
      'test-model',
      'This is a test prompt.',
      DEFAULT_GENERATION_CONFIG,
    );
    expect(response.status).toEqual(ModelResponseStatus.OK);
    const parsedResponse = JSON.parse(response.text);

    expect(parsedResponse.model).toEqual('test-model');
    expect(parsedResponse.response_format).toEqual({type: 'text'});
    expect(parsedResponse.messages).toEqual([
      {role: 'user', content: 'This is a test prompt.'},
    ]);
  });

  it('handles json format request', async () => {
    const structuredOutputConfig: StructuredOutputConfig =
      createStructuredOutputConfig({
        type: StructuredOutputType.JSON_FORMAT,
      });

    const response: ModelResponse = await getOpenAIAPIChatCompletionResponse(
      'testapikey',
      'https://test.uri/v1/',
      'test-model',
      'This is a test prompt.',
      DEFAULT_GENERATION_CONFIG,
      structuredOutputConfig,
    );
    expect(response.status).toEqual(ModelResponseStatus.OK);
    const parsedResponse = JSON.parse(response.text);

    expect(parsedResponse.model).toEqual('test-model');
    expect(parsedResponse.response_format).toEqual({type: 'json_object'});
    expect(parsedResponse.messages).toEqual([
      {role: 'user', content: 'This is a test prompt.'},
    ]);
  });

  it('handles json schema request', async () => {
    const structuredOutputConfig: StructuredOutputConfig =
      createStructuredOutputConfig({
        type: StructuredOutputType.JSON_SCHEMA,
        schema: {
          type: StructuredOutputDataType.OBJECT,
          properties: [
            {
              name: 'stringProperty',
              schema: {
                type: StructuredOutputDataType.STRING,
                description: 'A string-valued property',
              },
            },
            {
              name: 'integerProperty',
              schema: {
                type: StructuredOutputDataType.INTEGER,
                description: 'An integer-valued property',
              },
            },
          ],
        },
      });

    const response: ModelResponse = await getOpenAIAPIChatCompletionResponse(
      'testapikey',
      'https://test.uri/v1/',
      'test-model',
      'This is a test prompt.',
      DEFAULT_GENERATION_CONFIG,
      structuredOutputConfig,
    );
    // Mock request still just returns the response body, not actually the
    // specified schema.
    const parsedResponse = JSON.parse(response.text);

    expect(parsedResponse.model).toEqual('test-model');
    expect(parsedResponse.messages).toEqual([
      {role: 'user', content: 'This is a test prompt.'},
    ]);

    const expectedSchema = {
      type: 'OBJECT',
      properties: {
        stringProperty: {
          type: 'STRING',
          description: 'A string-valued property',
        },
        integerProperty: {
          type: 'INTEGER',
          description: 'An integer-valued property',
        },
      },
      additionalProperties: false,
      required: ['stringProperty', 'integerProperty'],
    };
    expect(parsedResponse.response_format).toEqual({
      type: 'json_schema',
      strict: true,
      json_schema: expectedSchema,
    });
  });

  xit('handles error response', async () => {
    nock('https://test.error.uri')
      .post('/v1/chat/completions')
      .reply(401, {
        error: {
          message: "You didn't provide an API key.",
          type: 'invalid_request_error',
          param: null,
          code: null,
        },
      });

    const response: ModelResponse = await getOpenAIAPIChatCompletionResponse(
      'testapikey',
      'https://test.error.uri/v1/',
      'test-model',
      'This is a test prompt.',
      DEFAULT_GENERATION_CONFIG,
    );

    expect(response.status).toEqual(ModelResponseStatus.AUTHENTICATION_ERROR);
    expect(response.text).toBeUndefined();
    expect(response.errorMessage).toEqual(
      "Error: 401 You didn't provide an API key.",
    );
  });
});
