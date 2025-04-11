// eslint-disable-next-line @typescript-eslint/no-require-imports
import nock = require('nock');

import {AgentGenerationConfig} from '@deliberation-lab/utils';
import {getOpenAIAPITextCompletionResponse} from './openai.api';
import {ModelResponse} from './model.response';

describe('OpenAI-compatible API', () => {
  it('handles text completion request with a legacy model using the completions api', async () => {
    nock('https://test.uri')
      .post('/v1/completions', (body) => body.model == 'text-davinci-003')
      .reply(200, {
        id: 'test-id',
        object: 'text_completion',
        created: Date.now(),
        model: 'text-davinci-003',
        choices: [
          {
            text: 'test output',
            index: 0,
            logprobs: null,
            finish_reason: 'stop',
          },
        ],
      });

    const generationConfig: AgentGenerationConfig = {
      temperature: 0.7,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
      customRequestBodyFields: [{name: 'foo', value: 'bar'}],
    };

    const response: ModelResponse = await getOpenAIAPITextCompletionResponse(
      'testapikey',
      'https://test.uri/v1/',
      'text-davinci-003',
      'This is a test prompt.',
      generationConfig,
    );

    expect(response.text).toEqual('test output');

    nock.cleanAll();
  });

  it('handles text completion request with a current model using the shiny new responses api', async () => {
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

    const generationConfig: AgentGenerationConfig = {
      temperature: 0.7,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
      customRequestBodyFields: [{name: 'foo', value: 'bar'}],
    };

    const response: ModelResponse = await getOpenAIAPITextCompletionResponse(
      'testapikey',
      'https://test.uri/v1/',
      'test-model',
      'This is a test prompt.',
      generationConfig,
    );

    expect(response.text).toEqual('test output');

    nock.cleanAll();
  });
});
