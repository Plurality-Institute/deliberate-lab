import '../../pair-components/textarea';

import {MobxLitElement} from '@adobe/lit-mobx';
import {CSSResultGroup, html, nothing} from 'lit';
import {customElement, property} from 'lit/decorators.js';

import {core} from '../../core/core';
import {AuthService} from '../../services/auth.service';

import {styles} from './experimenter_data_editor.scss';
import {
  ApiKeyType,
  ExperimenterData,
  createOpenAIServerConfig,
} from '@deliberation-lab/utils';

/** Editor for adjusting experimenter data */
@customElement('experimenter-data-editor')
export class ExperimenterDataEditor extends MobxLitElement {
  static override styles: CSSResultGroup = [styles];

  private readonly authService = core.getService(AuthService);

  override render() {
    return html`
      ${this.renderServerTypeButtons()}
      <div class="divider"></div>
      ${this.renderGeminiKey()}
      <div class="divider"></div>
      ${this.renderOpenAISettings()}
      <div class="divider"></div>
      ${this.renderOllamaSettings()}
    `;
  }

  // ============ Server Type selection ============
  private renderServerTypeButtons() {
    return html`
      <div class="section">
        <h3>LLM Host Selection</h3>
        <div class="title">
          The selected API will be used for all LLM calls (note: ability to
          specify API per agent coming soon!)
        </div>
        <div class="action-buttons">
          ${this.renderServerTypeButton('Gemini', ApiKeyType.GEMINI_API_KEY)}
          ${this.renderServerTypeButton(
            'OpenAI or compatible API',
            ApiKeyType.OPENAI_API_KEY,
          )}
          ${this.renderServerTypeButton(
            'Ollama Server',
            ApiKeyType.OLLAMA_CUSTOM_URL,
          )}
        </div>
      </div>
    `;
  }

  private renderServerTypeButton(
    serverTypeName: string,
    apiKeyType: ApiKeyType,
  ) {
    const isActive =
      this.authService.experimenterData?.apiKeys.activeApiKeyType ===
      apiKeyType;

    return html`
      <pr-button
        color="${isActive ? 'primary' : 'neutral'}"
        variant=${isActive ? 'tonal' : 'default'}
        @click=${() => this.selectServerType(apiKeyType)}
      >
        ${serverTypeName}
      </pr-button>
    `;
  }

  private selectServerType(serverType: ApiKeyType) {
    const oldData = this.authService.experimenterData;
    if (!oldData) return;

    const newData = updateExperimenterData(oldData, {
      apiKeys: {...oldData.apiKeys, activeApiKeyType: serverType},
    });

    this.authService.writeExperimenterData(newData);
    this.requestUpdate(); // Change visibility of relevant API key sections
  }

  // ============ Gemini ============
  private renderGeminiKey() {
    const updateKey = (e: InputEvent) => {
      const oldData = this.authService.experimenterData;
      if (!oldData) return;

      const geminiKey = (e.target as HTMLTextAreaElement).value;
      const newData = updateExperimenterData(oldData, {
        apiKeys: {...oldData.apiKeys, geminiApiKey: geminiKey},
      });

      this.authService.writeExperimenterData(newData);
    };

    return html`
      <div class="section">
        <h3>Gemini API settings</h3>
        <pr-textarea
          label="Gemini API key"
          placeholder="Add Gemini API key"
          variant="outlined"
          .value=${this.authService.experimenterData?.apiKeys.geminiApiKey ??
          ''}
          @input=${updateKey}
        ></pr-textarea>
      </div>
    `;
  }

  // ============ OpenAI-compatible API ============
  private renderOpenAISettings() {
    const updateOpenAISettings = (
      e: InputEvent,
      field: 'apiKey' | 'baseUrl',
    ) => {
      const oldData = this.authService.experimenterData;
      if (!oldData) return;

      const value = (e.target as HTMLInputElement).value;
      let newData;

      switch (field) {
        case 'apiKey':
          newData = updateExperimenterData(oldData, {
            apiKeys: {
              ...oldData.apiKeys,
              openAIApiKey: {
                ...(oldData.apiKeys?.openAIApiKey ??
                  createOpenAIServerConfig()),
                apiKey: value,
              },
            },
          });
          break;

        case 'baseUrl':
          newData = updateExperimenterData(oldData, {
            apiKeys: {
              ...oldData.apiKeys,
              openAIApiKey: {
                ...(oldData.apiKeys?.openAIApiKey ??
                  createOpenAIServerConfig()),
                baseUrl: value,
              },
            },
          });
          break;
        default:
          console.error('Error: field type not found: ', field);
          return;
      }

      this.authService.writeExperimenterData(newData);
    };

    const data = this.authService.experimenterData;
    return html`
      <div class="section">
        <h3>Open AI API settings</h3>
        <pr-textarea
          label="API Key"
          placeholder=""
          variant="outlined"
          .value=${data?.apiKeys.openAIApiKey?.apiKey ?? ''}
          @input=${(e: InputEvent) => updateOpenAISettings(e, 'apiKey')}
        ></pr-textarea>

        <pr-textarea
          label="Base URL (if blank, uses OpenAI's servers)"
          placeholder="http://example:14434/v1"
          variant="outlined"
          .value=${data?.apiKeys.openAIApiKey?.baseUrl ?? ''}
          @input=${(e: InputEvent) => updateOpenAISettings(e, 'baseUrl')}
        ></pr-textarea>
      </div>
    `;
  }

  // ============ Local Ollama server ============
  private renderOllamaSettings() {
    const updateServerSettings = (e: InputEvent, field: 'url') => {
      const oldData = this.authService.experimenterData;
      if (!oldData) return;

      const value = (e.target as HTMLInputElement).value;
      let newData;

      switch (field) {
        case 'url':
          newData = updateExperimenterData(oldData, {
            apiKeys: {
              ...oldData.apiKeys,
              ollamaApiKey: {
                ...oldData.apiKeys.ollamaApiKey,
                url: value,
              },
            },
          });
          break;
        default:
          console.error('Error: field type not found: ', field);
          return;
      }

      this.authService.writeExperimenterData(newData);
    };

    const data = this.authService.experimenterData;
    return html`
      <div class="section">
        <h3>Ollama API settings</h3>
        <pr-textarea
          label="Server URL (please ensure URL is valid!)"
          placeholder="http://example:80/api/chat"
          variant="outlined"
          .value=${data?.apiKeys.ollamaApiKey?.url ?? ''}
          @input=${(e: InputEvent) => updateServerSettings(e, 'url')}
        ></pr-textarea>
      </div>
    `;
  }
}

// Utility function to create updated ExperimenterData
function updateExperimenterData(
  oldData: ExperimenterData,
  updatedFields: Partial<ExperimenterData>,
): ExperimenterData {
  return {
    ...oldData,
    ...updatedFields,
    apiKeys: {
      ...oldData.apiKeys,
      ...updatedFields.apiKeys,
      ollamaApiKey: {
        ...oldData.apiKeys.ollamaApiKey,
        ...(updatedFields.apiKeys?.ollamaApiKey || {}),
      },
    },
  };
}
