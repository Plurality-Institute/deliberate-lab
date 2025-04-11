import OpenAI from 'openai';
import {AgentGenerationConfig} from '@deliberation-lab/utils';
import {ModelResponse} from './model.response';

const MAX_TOKENS_FINISH_REASON = 'length';

export async function callOpenAITextCompletion(
  apiKey: string,
  baseUrl: string | null,
  modelName: string,
  prompt: string,
  generationConfig: AgentGenerationConfig,
) {
  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: baseUrl,
  });

  const customFields = generationConfig.customRequestBodyFields
    ? Object.fromEntries(
        generationConfig.customRequestBodyFields.map(
          (field: {name: string; value: string}) => [field.name, field.value],
        ),
      )
    : {};
  const response = await client.completions.create({
    model: modelName,
    prompt: prompt,
    temperature: generationConfig.temperature,
    top_p: generationConfig.topP,
    frequency_penalty: generationConfig.frequencyPenalty,
    presence_penalty: generationConfig.presencePenalty,
    ...customFields,
  });

  if (!response || !response.choices) {
    console.error('Error: No response');

    return {text: ''};
  }

  const finishReason = response.choices[0].finish_reason;
  if (finishReason === MAX_TOKENS_FINISH_REASON) {
    console.error(`Error: Token limit exceeded`);
  }

  return {text: response.choices[0].text};
}

// The more recent OpenAI responses endpoint, which supports newer models
export async function callOpenAIResponses(
  apiKey: string,
  baseUrl: string | null,
  modelName: string,
  prompt: string,
  generationConfig: AgentGenerationConfig,
) {
  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: baseUrl,
  });

  const customFields = generationConfig.customRequestBodyFields
    ? Object.fromEntries(
        generationConfig.customRequestBodyFields.map(
          (field: {name: string; value: string}) => [field.name, field.value],
        ),
      )
    : {};

  const response = await client.responses.create({
    model: modelName,
    input: prompt,
    temperature: generationConfig.temperature,
    top_p: generationConfig.topP,
    ...customFields,
  });

  if (!response || !response.output_text) {
    console.error('Error: No response');

    return {text: ''};
  }

  if (response.status == 'incomplete' && response.incomplete_details) {
    console.error(
      'Error: Incomplete response',
      response.incomplete_details.reason,
    );
  }

  if (response.status == 'failed') {
    console.error('Error: Failed response', response.error);
  }

  return {text: response.output_text};
}

export async function getOpenAIAPITextCompletionResponse(
  apiKey: string,
  baseUrl: string | null,
  modelName: string,
  promptText: string,
  generationConfig: AgentGenerationConfig,
): Promise<ModelResponse> {
  if (!modelName) {
    console.warn('OpenAI API model name not set.');
  }
  if (!apiKey) {
    console.warn('OpenAI API key not set.');
  }
  // Log the request
  console.log(
    'call',
    'modelName:',
    modelName,
    'prompt:',
    promptText,
    'generationConfig:',
    generationConfig,
  );

  const LEGACY_MODELS = [
    'text-davinci-003',
    'text-davinci-002',
    'text-curie-001',
    'text-babbage-001',
    'text-ada-001',
    'code-davinci-002',
    'code-cushman-001',
  ];

  let response = {text: ''};
  try {
    if (LEGACY_MODELS.includes(modelName)) {
      response = await callOpenAITextCompletion(
        apiKey,
        baseUrl,
        modelName,
        promptText,
        generationConfig,
      );
    } else {
      response = await callOpenAIResponses(
        apiKey,
        baseUrl,
        modelName,
        promptText,
        generationConfig,
      );
    }
  } catch (error: unknown) {
    console.error('API error (response api):', {
      modelName: modelName,
      error: error,
    });
  }

  // Log the response
  console.log(response);
  return response;
}
