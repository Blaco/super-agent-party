// Add the content-loaded class after the page finishes loading
document.addEventListener('DOMContentLoaded', function() {
  // Wait briefly to ensure all resources are loaded
  setTimeout(function() {
    document.body.classList.add('content-loaded');
  }, 100);
});

// ==========================================
// 1. Define the A2UI rendering component (supports Markdown)
// ==========================================
const A2UIRendererComponent = {
  name: 'A2UIRenderer',
  components: {}, 
  template: `
    <div :class="['a2ui-root', isSelfContained ? 'a2ui-root-clean' : 'a2ui-root-boxed']">
      
      <!-- Root title -->
      <div v-if="uiConfig.props && uiConfig.props.title && !isSelfContained" class="a2ui-title">
        {{ uiConfig.props.title }}
      </div>
      <!-- Root description (also supports Markdown) -->
      <div 
        v-if="uiConfig.props && uiConfig.props.description && !isSelfContained" 
        class="a2ui-text-content markdown-body" 
        style="color: var(--el-text-color-secondary); font-size: 13px; margin-bottom: 15px;"
        v-html="renderMarkdown(uiConfig.props.description)"
      ></div>

      <el-form :model="formData" label-position="top" size="default" @submit.prevent>
        
        <div :class="containerClass">
          
          <template v-for="(item, index) in normalizedChildren" :key="index">
            
            <!-- 1. Input -->
            <el-form-item 
              v-if="item.type === 'Input'" 
              :label="item.props.label" 
              style="margin-bottom: 15px; flex: 1; min-width: 200px;"
            >
              <el-input 
                v-model="formData[item.props.key || ('input_'+index)]" 
                :placeholder="item.props.placeholder || 'Enter a value...'"
                size="large"
              >
                <template #append v-if="item.props.action === 'search'">
                  <el-button @click="handleAction(item, formData[item.props.key || ('input_'+index)])">
                    <i class="fa-solid fa-magnifying-glass"></i>
                  </el-button>
                </template>
              </el-input>
            </el-form-item>

            <!-- 2. Select -->
            <el-form-item 
              v-if="item.type === 'Select'" 
              :label="item.props.label"
              style="margin-bottom: 15px; flex: 1;"
            >
              <el-select 
                v-model="formData[item.props.key]" 
                :placeholder="item.props.placeholder || 'Select an option'" 
                style="width: 100%"
                size="large"
              >
                <el-option 
                  v-for="(opt, oIdx) in item.props.options" 
                  :key="oIdx" 
                  :label="isObj(opt) ? opt.label : opt" 
                  :value="isObj(opt) ? opt.value : opt" 
                />
              </el-select>
            </el-form-item>

            <!-- 3. Text (render with v-html and Markdown) -->
            <!-- Add markdown-body to reuse global Markdown styling -->
            <div 
              v-if="item.type === 'Text'" 
              class="a2ui-text-content markdown-body"
              v-html="renderMarkdown(item.props.content)"
            ></div>

            <!-- 4. Divider -->
            <el-divider 
              v-if="item.type === 'Divider'" 
              style="margin: 18px 0; border-color: var(--el-border-color-lighter);" 
            />

            <!-- 5. Group -->
            <div v-if="item.type === 'Group'" class="a2ui-group-container">
               <div v-if="item.props && item.props.title" style="width: 100%; font-weight: bold; margin-bottom: 8px; font-size: 14px;">
                  {{ item.props.title }}
               </div>
              <!-- Pass shared form data with :shared-form-data="formData" -->
              <a2-u-i-renderer 
                v-for="(child, cIdx) in item.children" 
                :key="cIdx" 
                :config="child"
                :shared-form-data="formData" 
                @action="relayAction"
                style="flex: 1; min-width: auto;" 
              />
            </div>

            <!-- 6. List -->
            <div v-if="item.type === 'List'" class="a2ui-list">
              <div 
                v-for="(listItem, lIdx) in item.props.items" 
                :key="lIdx" 
                class="a2ui-list-item"
                @click="handleManualAction('Select item', listItem.title)"
              >
                <div class="a2ui-list-title">{{ listItem.title }}</div>
                <div class="a2ui-list-desc">{{ listItem.description }}</div>
                <div class="a2ui-list-meta">
                  <span v-if="listItem.source" class="tag">{{ listItem.source }}</span>
                  <span class="time">{{ listItem.timestamp }}</span>
                </div>
              </div>
            </div>

            <!-- 7. Card -->
            <el-card 
              v-if="item.type === 'Card'" 
              shadow="hover" 
              class="a2ui-inner-card"
            >
              <template #header v-if="item.props.title">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-weight: bold; font-size: 16px;">{{ item.props.title }}</span>
                  <span v-if="item.props.subtitle" style="font-size: 12px; color: #909399; font-weight: normal;">{{ item.props.subtitle }}</span>
                </div>
              </template>
              
              <!-- Render Card content independently rather than with v-else -->
              <!-- Display content whenever present, whether or not children exist -->
              <div 
                v-if="item.props.content || item.props.description" 
                class="a2ui-card-desc markdown-body"
                style="margin-bottom: 15px;"
              >
                <div v-if="Array.isArray(item.props.content)">
                    <div v-for="(line, lIdx) in item.props.content" :key="lIdx" v-html="renderMarkdown(line)"></div>
                </div>
                <div v-else-if="item.props.content" v-html="renderMarkdown(item.props.content)"></div>
                <div v-else-if="item.props.description" v-html="renderMarkdown(item.props.description)"></div>
              </div>

              <!-- Render Card children independently -->
              <div v-if="item.children && item.children.length > 0">
                 <!-- Pass shared form data with :shared-form-data="formData" -->
                 <a2-u-i-renderer 
                    v-for="(child, ccIdx) in item.children" 
                    :key="ccIdx" 
                    :config="child"
                    :shared-form-data="formData"
                    @action="relayAction"
                 />
              </div>

              <div class="tags" v-if="item.props.tags" style="margin-top: 12px;">
                <el-tag v-for="tag in item.props.tags" :key="tag" size="default" effect="plain" style="margin-right: 6px;">
                  {{ tag }}
                </el-tag>
              </div>

              <div v-if="item.props.actions" class="a2ui-card-actions">
                <el-button 
                    v-for="(btn, bIdx) in item.props.actions"
                    :key="bIdx"
                    :type="bIdx === item.props.actions.length - 1 ? 'primary' : ''"
                    size="default"
                    @click="handleManualAction(btn.label, item.props.title)"
                >
                    {{ btn.label }}
                </el-button>
              </div>
            </el-card>

            <!-- 8. Button (description also supports Markdown) -->
            <div 
              v-if="item.type === 'Button'" 
              :style="buttonStyle"
            >
              <el-button 
                v-if="item.props.description"
                :type="resolveBtnType(item.props)"
                @click="handleAction(item)" 
                :disabled="isSubmitted"
                size="large"
                style="height: auto; padding: 12px 20px; text-align: left; display: inline-flex; flex-direction: column; align-items: flex-start; line-height: 1.4; width: 100%;"
              >
                <span style="font-weight: 600; font-size: 15px;">{{ item.props.label }}</span>
                <span style="font-size: 12px; opacity: 0.8; font-weight: normal; margin-top: 4px;" v-html="renderMarkdown(item.props.description)"></span>
              </el-button>

              <el-button 
                v-else
                :type="resolveBtnType(item.props)" 
                @click="handleAction(item)" 
                :disabled="isSubmitted"
                size="large" 
                style="width: 100%; font-weight: 500;"
              >
                {{ item.props.label }}
              </el-button>
            </div>

            <!-- 9. Slider -->
            <el-form-item 
              v-if="item.type === 'Slider'" 
              :label="item.props.label"
              style="margin-bottom: 15px; flex: 1; min-width: 200px;"
            >
              <div style="display: flex; align-items: center; width: 100%;">
                <el-slider 
                  v-model="formData[item.props.key]" 
                  :min="item.props.min || 0" 
                  :max="item.props.max || 100"
                  :step="item.props.step || 1"
                  show-input
                  size="default"
                  style="flex: 1; margin-right: 10px;"
                />
                <span v-if="item.props.unit" style="font-size: 12px; color: #909399;">{{ item.props.unit }}</span>
              </div>
            </el-form-item>

            <!-- 10. Switch -->
            <el-form-item 
              v-if="item.type === 'Switch'" 
              :label="item.props.label"
              style="margin-bottom: 15px;"
            >
              <el-switch 
                v-model="formData[item.props.key]" 
                :active-text="item.props.activeText || 'On'"
                :inactive-text="item.props.inactiveText || 'Off'"
              />
            </el-form-item>

            <!-- 11. Radio group -->
            <el-form-item 
              v-if="item.type === 'Radio'" 
              :label="item.props.label"
              style="margin-bottom: 15px;"
            >
              <el-radio-group v-model="formData[item.props.key]">
                <el-radio 
                  v-for="(opt, oIdx) in item.props.options" 
                  :key="oIdx" 
                  :label="isObj(opt) ? opt.value : opt"
                  border
                >
                  {{ isObj(opt) ? opt.label : opt }}
                </el-radio>
              </el-radio-group>
            </el-form-item>

            <!-- 12. Checkbox group -->
            <el-form-item 
              v-if="item.type === 'Checkbox'" 
              :label="item.props.label"
              style="margin-bottom: 15px;"
            >
              <el-checkbox-group v-model="formData[item.props.key]">
                <el-checkbox 
                  v-for="(opt, oIdx) in item.props.options" 
                  :key="oIdx" 
                  :label="isObj(opt) ? opt.value : opt"
                >
                  {{ isObj(opt) ? opt.label : opt }}
                </el-checkbox>
              </el-checkbox-group>
            </el-form-item>

            <!-- 13. Date picker -->
            <el-form-item 
              v-if="item.type === 'DatePicker'" 
              :label="item.props.label"
              style="margin-bottom: 15px;"
            >
              <el-date-picker
                v-model="formData[item.props.key]"
                :type="item.props.subtype || 'date'" 
                :placeholder="item.props.placeholder || 'Choose a date'"
                value-format="YYYY-MM-DD HH:mm:ss"
                style="width: 100%;"
              />
            </el-form-item>
            
            <!-- 14. Rating -->
            <el-form-item 
              v-if="item.type === 'Rate'" 
              :label="item.props.label"
              style="margin-bottom: 15px;"
            >
              <el-rate 
                v-model="formData[item.props.key]" 
                allow-half 
                show-text
                :texts="['Very poor', 'Poor', 'Neutral', 'Good', 'Excellent']"
              />
            </el-form-item>

             <!-- 15. Alert -->
             <div v-if="item.type === 'Alert'" style="margin-bottom: 15px; width: 100%;">
                <el-alert
                    :title="item.props.title"
                    :type="item.props.variant || 'info'"
                    :show-icon="item.props.showIcon !== false"
                    :closable="false"
                >
                    <template #default v-if="item.props.content">
                        <div v-html="renderMarkdown(item.props.content)"></div>
                    </template>
                </el-alert>
             </div>

            <!-- 16. Code block (render independently without an extra wrapper) -->
            <div 
              v-if="item.type === 'Code'" 
              class="a2ui-code-block"
            >
              <div class="code-header">
                <span class="lang-tag">{{ item.props.language || 'text' }}</span>
                <div class="copy-btn" @click="copyToClipboard(item.props.content, $event)">
                  <i class="fa-regular fa-copy"></i>
                  <span>copy</span>
                </div>
              </div>
              <div class="code-body">
                <pre><code>{{ item.props.content }}</code></pre>
              </div>
            </div>

            <!-- 17. Table -->
            <div 
              v-if="item.type === 'Table'" 
              class="a2ui-table-wrapper"
            >
              <div class="a2ui-table-scroll">
                <table class="a2ui-table">
                  <thead>
                    <tr>
                      <th v-for="(head, hIdx) in item.props.headers" :key="hIdx">
                        {{ head }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, rIdx) in item.props.rows" :key="rIdx">
                      <!-- Supports simple HTML or plain text -->
                      <td v-for="(cell, cIdx) in row" :key="cIdx" v-html="renderMarkdown(String(cell))"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- 18. Read-aloud text block -->
            <div 
              v-if="item.type === 'TTSBlock'" 
              class="a2ui-tts-block"
              @click="handleTTS(item.props.content, item.props.voice)"
              title="Play audio"
            >
              <div class="tts-icon">
                <i class="fa-solid fa-volume-high"></i>
              </div>
              <div class="tts-body">
                <div class="tts-label" v-if="item.props.label">{{ item.props.label }}</div>
                <div class="tts-content markdown-body" v-html="renderMarkdown(item.props.content)"></div>
              </div>
              <div class="tts-action-hint">
                <i class="fa-solid fa-play"></i>
              </div>
            </div>

            <div 
              v-if="item.type === 'Audio'" 
              class="a2ui-audio-player"
              style="margin-bottom: 15px; width: 100%;"
            >
              <div v-if="item.props.title" style="font-weight: bold; margin-bottom: 5px; font-size: 14px;">
                {{ item.props.title }}
              </div>
              <audio controls style="width: 100%; height: 40px;" :src="item.props.src">
                Your browser does not support audio playback.
              </audio>
              <div v-if="item.props.description" style="font-size: 12px; color: #909399; margin-top: 4px;">
                {{ item.props.description }}
              </div>
            </div>

          </template>
        </div>
      </el-form>
    </div>
  `,
  props: {
    config: { type: Object, required: true, default: () => ({}) },
    sharedFormData: { type: Object, default: null } 
  },
  data() {
    return { internalFormData: {}, isSubmitted: false };
  },
  computed: {
    activeDownloadCount() {
        return this.downloads.filter(d => d.state === 'progressing').length;
    },
    formData() {
      return this.sharedFormData || this.internalFormData;
    },
    uiConfig() {
      if (Array.isArray(this.config)) return { children: this.config };
      return this.config || {};
    },
    isSelfContained() {
      return ['Card', 'Group', 'List', 'Divider'].includes(this.uiConfig.type);
    },
    normalizedChildren() {
        const conf = this.uiConfig;
        if (conf.children && Array.isArray(conf.children)) {
            return conf.children;
        }
        if (conf.type) {
            return [conf];
        }
        return [];
    },
    containerClass() {
      if (this.uiConfig.type === 'Group') {
        return 'a2ui-group-container';
      }
      return 'a2ui-form-container';
    },
    buttonStyle() {
      if (this.uiConfig.type === 'Group') {
        return { margin: '0 5px', flex: '1' };
      }
      return { textAlign: 'right', marginTop: '10px', width: '100%' };
    }
  },
  created() {
    this.normalizedChildren.forEach((child, idx) => {
      // Components that require data binding
      const formComponents = ['Input', 'Select', 'Slider', 'Switch', 'Radio', 'Checkbox', 'DatePicker', 'Rate'];
      
      if (formComponents.includes(child.type)) {
         const key = (child.props && child.props.key) || (child.type.toLowerCase() + '_' + idx);
         
         if (this.formData[key] === undefined) {
            // Initialize defaults according to component type
            if (child.type === 'Checkbox') {
                this.formData[key] = []; // Multiple selections must start as an array
            } else if (child.type === 'Slider' || child.type === 'Rate') {
                this.formData[key] = child.props.min || 0; // Numeric value
            } else if (child.type === 'Switch') {
                this.formData[key] = child.props.defaultValue || false; // Boolean value
            } else {
                this.formData[key] = ''; // String value
            }
         }
      }
    });
  },
  methods: {
    resetForm() {
      // Recursively traverse every level to find form fields
      const traverseAndReset = (items) => {
        if (!Array.isArray(items)) return;

        items.forEach(item => {
          // Recurse into container components (Group, Card, etc.)
          if (item.children && Array.isArray(item.children)) {
            traverseAndReset(item.children);
          }

          // Reset form components
          const formComponents = ['Input', 'Select', 'Slider', 'Switch', 'Radio', 'Checkbox', 'DatePicker', 'Rate'];
          
          if (formComponents.includes(item.type)) {
             // Get the bound key
             const key = (item.props && item.props.key);
             if (!key) return; // Ignore components without a key
             
             // Restore defaults according to component type
             if (item.type === 'Checkbox') {
                 this.formData[key] = []; // Multiple selection -> empty array
             } else if (item.type === 'Slider' || item.type === 'Rate') {
                 this.formData[key] = item.props.min || 0; // Numeric value -> 0
             } else if (item.type === 'Switch') {
                 this.formData[key] = item.props.defaultValue || false; // Switch -> false
             } else {
                 this.formData[key] = ''; // Other text fields -> empty string
             }
          }
        });
      };

      // Start recursion at the current component's root children
      traverseAndReset(this.normalizedChildren);

      // Reset submission state
      this.isSubmitted = false;
      
      // Provide UI feedback
      if (typeof showNotification === 'function') {
          showNotification('All options reset', 'success');
      }
    },
    handleTTS(text, voice) {
      // Try invoking ClickToListen on the root component
      if (this.$root && typeof this.$root.ClickToListen === 'function') {
        this.$root.ClickToListen(text, voice);
      } else {
        console.warn('A2UI: ClickToListen method not found on the root instance.');
        this.$emit('action', `TTS playback request: ${text}`); // Fallback
      }
    },

    async copyToClipboard(text, event) {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        
        // Provide simple interaction feedback by changing the button text
        const btn = event.currentTarget;
        const originalHtml = btn.innerHTML;
        const span = btn.querySelector('span');
        if(span) span.innerText = 'Copied!';
        
        setTimeout(() => {
          btn.innerHTML = originalHtml;
        }, 2000);
        
        // Alternatively, use the global notification component:
        // showNotification('Code copied', 'success');
      } catch (err) {
        console.error('Copy failed:', err);
      }
    },

    // Core Markdown rendering method
    renderMarkdown(text) {
        if (!text) return '';
        // Try the globally defined md object
        if (typeof md !== 'undefined' && md.render) {
            return sanitizeChatHtml(md.render(text));
        }
        // Fallback: handle line breaks if md is unavailable
        return sanitizeChatHtml(text.replace(/\n/g, '<br>'));
    },
    isObj(val) {
      return val && typeof val === 'object';
    },
    resolveBtnType(props) {
        if (props.variant === 'primary') return 'primary';
        if (props.variant === 'danger') return 'danger';
        return props.type || 'default';
    },
handleAction(item, extraValue) {
      // ... (retain the existing Clear/Reset interception logic) ...
      if (item.props.action === 'clear' || item.props.action === 'reset') {
          if (this.sharedFormData) {
              this.$emit('action', '_A2UI_RESET_ALL_'); 
          } else {
              this.resetForm();
          }
          return; 
      }

      // ---------------------------------------------------------
      // Normal action handling (Submit / Search)
      // ---------------------------------------------------------
      this.isSubmitted = true;
      let payload = item.props.label;
      
      if (item.props.action === 'search' && extraValue) {
          payload = `Search: ${extraValue}`;
      }
      else if (item.props.action === 'submit') {
        const formDataKeys = Object.keys(this.formData);
        
        // Case A: single-field form, send "Label: value" directly
        if (formDataKeys.length === 1 && this.formData[formDataKeys[0]]) {
            const singleValue = this.formData[formDataKeys[0]];
            payload = `${item.props.label}：${singleValue}`;
        } 
        // Case B: multi-field form, send the combined details
        else {
            let details = [];
            const findFieldLabel = (nodes, targetKey) => {
                for (const node of nodes) {
                    if (node.props && node.props.key === targetKey) return node.props.label;
                    if (node.children) {
                        const found = findFieldLabel(node.children, targetKey);
                        if (found) return found;
                    }
                }
                return targetKey; 
            };

            for (const [key, val] of Object.entries(this.formData)) {
                 if (val === undefined || val === '' || val === null || (Array.isArray(val) && val.length === 0)) continue;
                 
                 const label = findFieldLabel(this.normalizedChildren, key);
                 let displayVal = val;
                 details.push(`${label}：${displayVal}`);
            }
            
            if (details.length > 0) {
                // ============================================================
                // Key payload construction fix
                // Previous approach: send a generic form submission header followed by details.
                // Instead, explicitly prepend the button name (item.props.label) to the message
                // ============================================================
                payload = `Submit action: ${item.props.label}\nForm data:\n${details.join('\n')}`;
            } else {
                // Retain the button name if every field is empty
                payload = `${item.props.label} (empty form submission)`;
            }
        }
      } 
      else if (item.props.data) {
          payload = `Select action: ${item.props.label} (ID:${item.props.data})`;
      }
      
      // Send the final payload to the parent
      this.$emit('action', payload);
    },

    handleManualAction(actionName, title) {
        this.$emit('action', `Selected: ${title} - ${actionName}`);
    },
    relayAction(payload) {
        // Intercept the special _A2UI_RESET_ALL_ signal
        if (payload === '_A2UI_RESET_ALL_') {
            if (this.sharedFormData) {
                // Child component: continue propagating the signal upward
                this.$emit('action', '_A2UI_RESET_ALL_');
            } else {
                // Root component: clear the form
                this.resetForm();
            }
            return; // Finish interception without calling sendMessage
        }

        // Forward normal messages to the parent, ultimately calling handleA2UIAction
        this.$emit('action', payload);
    }
  }
};

const MAX_DISPLAY_LENGTH = 50000;   // Frontend truncation limit for tool results and errors
const MAX_RENDERED_BLOCKS = 10;
// ==========================================
// 2. Create the Vue application
// ==========================================
const app = Vue.createApp({
  data() {
    return vue_data
  },
  // Clear timers when the component is destroyed
  beforeDestroy() {
    this.stopEdgeScroll();
    if (this.behaviorTimeTimer)   clearInterval(this.behaviorTimeTimer)
    if (this.behaviorNoInputTimer) clearInterval(this.behaviorNoInputTimer)
    if (this.vrmPollTimer) clearInterval(this.vrmPollTimer)
    clearInterval(this.behaviorCycleTimer);
    this.cycleTimers.forEach(timer => {
      if (timer) clearInterval(timer);
    });
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('resize', this.checkMobile);
    this.shouldReconnectWs = false; // Set the reconnect flag
    this.stopDanmuProcessor(); // Stop the livestream message processor
    this.disconnectWebSocket();
  },
  async mounted() {
    try {
      // Register global shortcuts only in Electron
      if (isElectron && window.electronAPI?.onGlobalShortcutTriggered) {
          window.electronAPI.onGlobalShortcutTriggered(async () => {
            // Only active when ASR and global shortcut mode are enabled
            if (this.asrSettings.interactionMethod !== 'globalKeyTriggered') return;

            if (!this.isGlobalRecording) {
              // First shortcut press: begin recording
              this.isGlobalRecording = true;
              await this.handlePttPress(); 
              // Optional notification that background recording has started
              showNotification(this.t('globalRecordingStarted'), 'success')
            } else {
              // Second shortcut press: stop recording
              this.isGlobalRecording = false;
              await this.handlePttRelease(); 
            }
          });
        }

      // Register IPC listeners only in Electron
      if (isElectron && window.electron && window.electron.ipcRenderer) {
          window.electron.ipcRenderer.on('trigger-search', (text) => {
              // 1. Put the selected text into the address bar variable
              this.urlInput = text;
              
              // 2. Invoke the existing Enter-key handler directly
              // This reuses the existing regex checks and Google/Bing/Party search selection
              this.handleUrlEnter();
          });
      }
      this.fetchDataPath();
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000
      });
      this.audioStartTime = this.audioCtx.currentTime;
      
      // Get the app path only in Electron
      let fileUrl = '';
      if (isElectron && window.electronAPI) {
        const appPath = await window.electronAPI.getAppPath();
        // Join the app root with static/js/webview-preload.js
        const fullPath = await window.electronAPI.pathJoin(appPath, 'static', 'js', 'webview-preload.js');
        
        // 2. Convert to a file:// URL
        // On Windows, replace backslashes with forward slashes for the URL
        fileUrl = 'file://' + (this.isWindows ? '/' : '') + fullPath.replace(/\\/g, '/');
        
        console.log('Webview Preload URL:', fileUrl); // Debug logging
      }
      
      this.webviewPreloadPath = fileUrl;
      
    } catch (e) {
      console.error('Failed to get preload path:', e);
    }

    window.handleToolApproval = (toolCallId, action) => {
        console.log('Global approval triggered:', toolCallId, action); // Debug logging
        this.processToolApproval(toolCallId, action);
    };
    
    // Listen for new-tab requests from the main process (Electron only)
    if (isElectron && window.electronAPI && window.electronAPI.onNewTab) {
        window.electronAPI.onNewTab((url) => {
            console.log('Received new tab request:', url);
            this.openUrlInNewTab(url);
        });
    }
    
    // Listen for download events (Electron only)
    if (isElectron && window.downloadAPI) {
        window.downloadAPI.onDownloadStarted((data) => {
            console.log('Frontend received download task:', data);
            // Insert new downloads at the beginning
            this.downloads.unshift({
                ...data,
                state: 'progressing',
                receivedBytes: 0,
                progress: 0
            });
            // Optionally open the dropdown to notify the user
            // this.showDownloadDropdown = true; 
        });

        window.downloadAPI.onDownloadUpdated((data) => {
            const item = this.downloads.find(d => d.id === data.id);
            if (item) {
                Object.assign(item, data); // Update status and progress
            }
        });

        window.downloadAPI.onDownloadDone((data) => {
            const item = this.downloads.find(d => d.id === data.id);
            if (item) {
                item.state = data.state;

                if (data.path) {
                    item.path = data.path; 
                }
                if (data.state === 'completed') {
                    item.progress = 1;
                    item.receivedBytes = item.totalBytes;
                }
            }
        });
    }
    
    await this.probeNode();
    await this.probeUv(); 
    await this.probeDocker();
    this.checkMobile();
    this.loadSherpaStatus();
    this.loadMossStatus();
    this.minilmModelStatus();
    window.addEventListener('resize', this.handleResize);
    
    if (isElectron) {
      this.checkServerPort();
      this.loadAccountList();
    }
    
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    window.addEventListener('resize', this.checkMobile);
    this.pollVRMStatus()   // Start polling
    
    if (isElectron) {
      this.isMac = window.electron.isMac;
      this.isWindows = window.electron.isWindows;
    }

    if (!this.isWindows && this.CLISettings.engine === 'wsl') {
      this.CLISettings.engine = 'local';
    }
    
    this.initWebSocket();
    this.highlightCode();
    this.initDownloadButtons();
    
    if (isElectron) {
      // Listen for compact-window close events and synchronize state
      if (window.electronAPI.onMinimalWindowClosed) {
        window.electronAPI.onMinimalWindowClosed(() => {
          this.isMinimalMode = false;
        });
      }
      // Check for updates
      this.checkForUpdates();
      // Listen for update events
      window.electronAPI.onUpdateAvailable((_, info) => {
        this.updateAvailable = true;
        this.updateInfo = info;
        showNotification(this.t('updateAvailable'), 'info');
      });
      window.electronAPI.onUpdateNotAvailable(() => {
        this.updateAvailable = false;
        this.updateInfo = null;
      });
      window.electronAPI.onUpdateError((_, err) => {
        showNotification(err, 'error');
      });
      window.electronAPI.onDownloadProgress((_, progress) => {
        this.downloadProgress = progress.percent;
        this.updateIcon = 'fa-solid fa-spinner fa-spin';
      });
      window.electronAPI.onUpdateDownloaded(() => {
        this.updateDownloaded = true;
        this.updateIcon = 'fa-solid fa-rocket';
      });
    }
    
    this.$nextTick(() => {
      this.initPreviewButtons();
    });
    this.$nextTick(() => {               // Ensure the DOM has rendered
      document.addEventListener('click', this._toggleHighlight, false);
    });
    document.documentElement.setAttribute('data-theme', this.systemSettings.theme);
    // Synchronize initial global and code-block zoom values at startup
    {
      const scale = Number(this.systemSettings.fontScale) || 1;
      if (this.isElectron && window.electronAPI?.setZoomFactor) {
        try { window.electronAPI.setZoomFactor(scale); } catch (e) { document.documentElement.style.zoom = scale; }
      } else {
        document.documentElement.style.zoom = scale;
      }
      document.documentElement.style.setProperty('--app-zoom', String(scale));
      const codeScale = Number(this.systemSettings.codeFontScale) || 1;
      document.documentElement.style.setProperty('--code-zoom', String(codeScale));
    }
    
    if (isElectron) {
      window.stopDiscordBotHandler = this.requestDiscordBotStopIfRunning;
      window.stopTelegramBotHandler = this.requestTelegramBotStopIfRunning;
      window.stopSlackBotHandler = this.requestSlackBotStopIfRunning;
      window.electronAPI.onWindowState((_, state) => {
        this.isMaximized = state === 'maximized'
      });
    }
    
    this.initTTSWebSocket();
    if (isElectron) {
      window.aiBrowser = this;
      this.$nextTick(() => {
        this.generateQRCode(); // Generate the QR code
      });
    }
    
    // 1. Time trigger
    this.behaviorTimeTimer = setInterval(() => {
      if (!this.behaviorSettings.enabled) return
      const now = new Date()
      const hm = now.toLocaleTimeString('en-GB', { hour12: false }) 
      const d  = now.getDay() 
      this.behaviorSettings.behaviorList.forEach(b => {
        // Use isTargetPlatform to check whether the task targets the current web chat
        if (!b.enabled || b.trigger.type !== 'time' || !this.isTargetPlatform(b, 'chat')) return
        const tv = b.trigger.time.timeValue
        const ds = b.trigger.time.days
        if (tv === hm) {
          if (ds.length === 0 || ds.includes(d)) {
            this.runBehavior(b)
            this.disableOnceBehavior(b)
          }
        }
      })
    }, 1000)

    // 2. No-input trigger
    this.noInputSec = 0 
    this.behaviorNoInputTimer = setInterval(() => {
      if (!this.behaviorSettings.enabled) return
      this.behaviorSettings.behaviorList.forEach(b => {
        // Check the target platform
        if (!b.enabled || b.trigger.type !== 'noInput' || !this.isTargetPlatform(b, 'chat')) return
        const need = b.trigger.noInput.latency
        if (this.noInputFlag) {
          this.noInputSec++
          if (this.noInputSec >= need) {
            this.runBehavior(b)
            this.noInputSec = 0 
          }
        } else {
          this.noInputSec = 0
        }
      })
    }, 1000)

    // 3. Periodic trigger
    this.behaviorCycleTimer = setInterval(() => {
      // Guard against missing objects at each level
      if (!this.behaviorSettings) return;
      if (this.behaviorSettings.enabled !== true) return;
      if (!Array.isArray(this.behaviorSettings.behaviorList)) return;

      this.behaviorSettings.behaviorList.forEach((b, index) => {
        // Check that b and its trigger exist before accessing b.trigger.type
        if (!b || !b.enabled || !b.trigger) return;
        
        // Handle periodic tasks only
        if (b.trigger.type !== 'cycle') return;

        // Check the platform using the helper above
        if (!this.isTargetPlatform(b, 'chat')) return;

        // Ensure the timer array exists
        if (!this.cycleTimers) this.cycleTimers = [];

        if (!this.cycleTimers[index]) {
          this.initCycleTimer(b, index);
        }
      });
    }, 1000);

    this.scanExtensions(); // Scan extensions
    if (this.ttsSettings && this.ttsSettings.engine === 'systemtts') {
      this.fetchSystemVoices();
    }
    document.addEventListener('click', (e) => {
        const selector = document.querySelector('.engine-selector');
        if (selector && !selector.contains(e.target)) {
            this.showEngineDropdown = false;
        }
    });
    this.loadFavorites();

    const handleRemoteInstall = (data) => {
      // 1. Select the menu and submenu based on type
      if (data.type === 'mcp') {
          this.handleRemoteMCPInstall(data);
          return;
      }
      const { repo, type } = data;
      if (!repo) return;
      if (type === 'skill') {
        this.activeMenu = 'toolkit'; // Skills are expected in this group
        this.subMenu = 'CLI';      // Switch to the Skills submenu
        this.activeCLITab = 'skills';
        this.newSkillUrl = repo;      
      } else {
        this.activeMenu = 'api-group';
        this.subMenu = 'extension';
        this.newExtensionUrl = repo;
      }

      // 2. Confirmation dialog
      const confirmMsg = type === 'skill' 
        ? `${this.t('confirmInstallSkillFrom')}：\n${repo}`
        : `${this.t('confirmInstallExtensionFrom')}：\n${repo}`;

      this.$confirm(
        confirmMsg, 
        this.t('confirmInstall'), 
        { 
          confirmButtonText: this.t('confirm'), 
          cancelButtonText: this.t('cancel'),
          type: 'info' 
        }
      ).then(() => {
        // 3. Invoke the corresponding installation method
        if (type === 'skill') {
          this.installSkillFromGithub();
        } else {
          this.addExtension(); // Run the extension installation method
        }
      }).catch(() => {
        console.log('User cancelled installation');
      });
    };

    // --- Mount listeners (Electron only) ---
    if (isElectron && window.electronAPI) {
      // Triggered while the application is running
      window.electronAPI.onRemoteInstall((payload) => {
        // The payload contains { repo, type }
        handleRemoteInstall(payload);
      });

      // Check on application startup
      setTimeout(async () => {
        const pendingData = await window.electronAPI.checkPendingInstall();
        if (pendingData) {
          handleRemoteInstall(pendingData);
        }
      }, 1000);
    }

    this.$nextTick(() => {
      setTimeout(() => {
        if (isElectron) {
          this.updateGlobalShortcut();
        }
      }, 1000); // Delay to allow the main process to become ready
    });

    if (this.localAppControlSettings?.enabled) {
      setTimeout(() => this.syncAppConnections(), 2000);
    }
  },
  beforeUnmount() {
    this.stopEdgeScroll();
    this.stopSkillsPolling();
    this.stopExtensionsPolling();
    clearInterval(this.nodeTimer);
    clearInterval(this.uvTimer); 
    if (window.electronAPI?.unregisterGlobalShortcut) {
      window.electronAPI.unregisterGlobalShortcut();
    }
    if (isElectron) {
      delete window.stopDiscordBotHandler;
      delete window.stopTelegramBotHandler;
      delete window.stopSlackBotHandler;
    }
    if (this.ttsWebSocket) {
      this.ttsWebSocket.close();
    }
    document.removeEventListener('click', this._toggleHighlight, false);
    window.removeEventListener('resize', this.handleResize);
    if (window.electronAPI && window.electronAPI.stopWorkspaceWatch) {
      window.electronAPI.stopWorkspaceWatch();
    }

  },
  watch: {

    // Watch input text to drive the shortcut popup
    userInput() {
      this.refreshShortcutMenu();
    },

    // Watch background image changes and apply them to the body
    'systemSettings.backgroundURL': {
      handler(newUrl) {
        if (newUrl) {
          document.body.style.backgroundImage = `url(${newUrl})`;
          document.body.style.backgroundSize = 'cover';
          document.body.style.backgroundPosition = 'center center';
          document.body.style.backgroundAttachment = 'fixed'; // Keep the background fixed during scrolling
          document.body.classList.add('has-custom-bg'); // Mark the body to activate frosted-glass CSS
        } else {
          document.body.style.backgroundImage = '';
          document.body.classList.remove('has-custom-bg');
        }
      },
      immediate: true // Run once immediately when the component loads
    },

    // Watch custom CSS injection
    'systemSettings.customCSS': {
      handler(css) {
        let styleEl = document.getElementById('custom-css-injection');
        if (css) {
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'custom-css-injection';
            document.head.appendChild(styleEl);
          }
          styleEl.textContent = css;
        } else if (styleEl) {
          styleEl.remove();
        }
      },
      immediate: true
    },

    'CLISettings.cc_path': {
      handler(newPath) {
        if (newPath) {
          console.log('Workspace path updated; starting file watcher:', newPath);
          this.setupWorkspaceWatcher(newPath);
        } else if (window.electronAPI && window.electronAPI.stopWorkspaceWatch) {
          window.electronAPI.stopWorkspaceWatch();
        }
      },
      immediate: true
    },

    showHistorySidebar() {
      this.$nextTick(() => {
        // When the sidebar is shown or hidden, preserve the layout proportions within the available space
        this.updatePanelWidths();
      });
    },

    'asrSettings.interactionMethod': {
      handler() { this.updateGlobalShortcut(); }
    },
    'asrSettings.enabled': {
      handler() { this.updateGlobalShortcut(); }
    },

    sidePanelOpen(val) {
        if (!val && this.taskRefreshTimer) {
            clearInterval(this.taskRefreshTimer);
        } else if (val && this.activeSideView === 'tasks') {
            this.fetchTasks();
            this.taskRefreshTimer = setInterval(this.fetchTasks, 3000);
        }
    },
    'tempBehavior.trigger.cycle.cycleValue'(newVal) {
      if (newVal === '00:00:00') {
        this.tempBehavior.trigger.cycle.cycleValue = '00:00:01';
      }
    },
    activeMenu(newVal) {
      this.handleExtensionsPolling(newVal, this.subMenu);
      this.handleSkillsPolling(newVal, this.subMenu, this.activeCLITab);
    },
    // Watch the submenu
    subMenu(newVal) {
      this.handleExtensionsPolling(this.activeMenu, newVal);
      this.handleSkillsPolling(this.activeMenu,newVal, this.activeCLITab);
    },
    // Watch the internal CLI tab
    activeCLITab(newVal) {
      this.handleSkillsPolling(this.activeMenu,this.subMenu, newVal);
    },
    'CLISettings.cc_path': function(newPath) {
      console.log('Workspace path changed; updating skill state');
      this.fetchProjectSkillsStatus();
    },
    'searchEngine': function(newVal) {
      if (newVal === 'party') {
        this.searchEngineplaceholder = this.t('searchWithParty')
      }else if (newVal === 'bing') {
        this.searchEngineplaceholder = this.t('searchWithBing')
      }else if (newVal === 'google') {
        this.searchEngineplaceholder = this.t('searchWithGoogle')
      }
    },
    currentTheme: {
      handler(newVal) {
        // Wait for DOM updates so CSS variables have changed
        this.$nextTick(() => {
          // Update styles in every tab
          this.browserTabs.forEach(tab => {
            this.updateWebviewTheme(tab.id);
          });
        });
      },
      immediate: false // Do not run immediately; dom-ready handles initialization
    },
    'ttsSettings.engine': function(newVal) {
      if (newVal === 'systemtts') {
        // Fetch the list if empty
        if (this.systemVoices.length === 0) {
          this.fetchSystemVoices();
        }
      }
    },
    'readConfig.longText': {
      immediate: true,
      async handler(val) {          // Asynchronous watcher
        await this.$nextTick();     // Wait for the previous render to complete
        if (!val?.trim()) {
          this.clearSegments();
          return;
        }
        this.reSegment();
      }
    },
    selectedCodeLang() {
      this.highlightCode();
    },
    modelProviders: {
      deep: true,
      handler(newProviders) {
        const existingIds = new Set(newProviders.map(p => p.id));
        // Automatically clear an invalid selectedProvider
        [this.settings, this.reasonerSettings,this.visionSettings,
          this.KBSettings,this.text2imgSettings,this.ccSettings,
          this.qcSettings,this.fastSettings
        ].forEach(config => {
          if (config.selectedProvider && !existingIds.has(config.selectedProvider)) {
            config.selectedProvider = null;
            // Optionally reset related fields as well
            config.model = '';
            config.base_url = '';
            config.api_key = '';
          }
          if (!config.selectedProvider && newProviders.length > 0) {
            config.selectedProvider = newProviders[0].id;
          }
        });
        [this.settings, this.reasonerSettings,this.visionSettings,
          this.KBSettings,this.text2imgSettings,this.ccSettings,
          this.qcSettings,this.fastSettings
        ].forEach(config => {
          if (config.selectedProvider) this.syncProviderConfig(config);
        });
      }
    },
    'systemSettings.theme': {
      handler(newVal) {
        document.documentElement.setAttribute('data-theme', newVal);
        
        // Update the Mermaid theme
        if (window.mermaid) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme : ['dark','midnight','neon'].includes(newVal) ? 'dark' : 'default'
          });
        }

        // Element Plus defines --el-color-primary: #409eff in :root in element-plus.css,
        // which loads after styles.css and overrides earlier colors at equal specificity.
        // Set the primary color and variants inline to match the CSS [data-theme] blocks.
        const cssPrimary = {
          light: '#17827a',
          dark: '#c8815a',
          midnight: '#4d94f0',
          desert: '#c4784a',
          neon: '#e04090',
          marshmallow: '#e29aaa',
          ink: '#2a3b4c',
          party: '#e08a20',
          rainbow: '#7a5cc0',
        }[newVal];

        if (cssPrimary) {
          const root = document.documentElement;
          root.style.setProperty('--el-color-primary', cssPrimary);
          root.style.setProperty('--el-color-primary-light-9', this.colorBlend(cssPrimary, '#ffffff', 0.1));
          root.style.setProperty('--el-color-primary-light-8', this.colorBlend(cssPrimary, '#ffffff', 0.2));
          root.style.setProperty('--el-color-primary-light-7', this.colorBlend(cssPrimary, '#ffffff', 0.3));
          root.style.setProperty('--el-color-primary-light-6', this.colorBlend(cssPrimary, '#ffffff', 0.4));
          root.style.setProperty('--el-color-primary-light-5', this.colorBlend(cssPrimary, '#ffffff', 0.5));
          root.style.setProperty('--el-color-primary-light-4', this.colorBlend(cssPrimary, '#ffffff', 0.6));
          root.style.setProperty('--el-color-primary-light-3', this.colorBlend(cssPrimary, '#ffffff', 0.7));
          root.style.setProperty('--el-color-primary-light-2', this.colorBlend(cssPrimary, '#ffffff', 0.8));
          root.style.setProperty('--el-color-primary-light-1', this.colorBlend(cssPrimary, '#ffffff', 0.9));
          root.style.setProperty('--el-color-primary-dark-1', this.colorBlend(cssPrimary, '#000000', 0.3));
          root.style.setProperty('--el-color-primary-dark-2', this.colorBlend(cssPrimary, '#000000', 0.2));
          root.style.setProperty('--el-color-primary-dark-3', this.colorBlend(cssPrimary, '#000000', 0.1));

          // Force an Element Plus theme refresh
          if (window.__ELEMENT_PLUS_INSTANCE__) {
            window.__ELEMENT_PLUS_INSTANCE__.config.globalProperties.$ELEMENT.reload();
          }
        }
      },
      immediate: true
    },
    'systemSettings.fontScale': {
      handler(newVal) {
        const safe = Math.max(0.85, Math.min(1.5, Number(newVal) || 1));
        if (this.isElectron && window.electronAPI?.setZoomFactor) {
          try { window.electronAPI.setZoomFactor(safe); } catch (e) { document.documentElement.style.zoom = safe; }
        } else {
          document.documentElement.style.zoom = safe;
        }
        document.documentElement.style.setProperty('--app-zoom', String(safe));
      },
      immediate: true
    },
    'systemSettings.codeFontScale': {
      handler(newVal) {
        const safe = Math.max(0.83, Math.min(1.67, Number(newVal) || 1));
        document.documentElement.style.setProperty('--code-zoom', String(safe));
      },
      immediate: true
    },
    'systemSettings.language': {
      handler(newVal) {
        if (this.isElectron) {
          window.electronAPI.sendLanguage(newVal);
        }
      },
      immediate: true
    },
  },
  computed: {

    selectedSoulxImage() {
      const imgs = (this.SoulxConfig && this.SoulxConfig.images) || [];
      return imgs.find(i => i.id === this.SoulxConfig.selectedImageId) || null;
    },

    getEiditDialogTitle() {
      if (this.editType === 'system'){
        return this.t('editSystemPrompt');
      }else if (this.editType === 'user'){
        return this.t('editMessage');
      }else{
        return this.t('viewOriginalMessage');
      }
    },

    groupedModelProviders() {
      const groups = {};
      const providers = this.modelProviders || [];
      providers.forEach(p => {
        const vendor = p.vendor || 'Unknown';
        if (!groups[vendor]) groups[vendor] = [];
        groups[vendor].push(p);
      });
      return Object.entries(groups).map(([vendor, providers]) => ({
        vendor,
        providers
      }));
    },

    // Provider name for the current main model
    mainVendorName() {
      if (!this.settings.selectedProvider) return null;
      const provider = this.modelProviders.find(p => p.id === this.settings.selectedProvider);
      return provider ? provider.vendor : null;
    },
    // Provider name for the current quick-response model
    fastVendorName() {
      if (!this.fastSettings.selectedProvider) return null;
      const provider = this.modelProviders.find(p => p.id === this.fastSettings.selectedProvider);
      return provider ? provider.vendor : null;
    },
    // Recommended parameters for the main model
    mainSuggestedParams() {
      const vendor = this.mainVendorName;
      if (!vendor || !this.vendorSuggestedParams[vendor]) return [];
      return this.vendorSuggestedParams[vendor].filter(p => !this.paramExistsInMain(p.name));
    },
    // Recommended parameters for the quick-response model
    fastSuggestedParams() {
      const vendor = this.fastVendorName;
      if (!vendor || !this.vendorSuggestedParams[vendor]) return [];
      return this.vendorSuggestedParams[vendor].filter(p => !this.paramExistsInFast(p.name));
    },

    // Main-page extension list filtering
    filteredManageExtensions() {
      if (!this.searchManageExtensionQuery) {
        return this.extensions;
      }
      const query = this.searchManageExtensionQuery.toLowerCase();
      return this.extensions.filter(ext => {
        const matchName = ext.name && ext.name.toLowerCase().includes(query);
        const matchDesc = ext.description && ext.description.toLowerCase().includes(query);
        const matchAuthor = ext.author && ext.author.toLowerCase().includes(query);
        return matchName || matchDesc || matchAuthor; // Include author matches
      });
    },

    // Remote plugin dialog filtering
    filteredRemotePlugins() {
      if (!this.searchRemotePluginQuery) {
        return this.remotePlugins;
      }
      const query = this.searchRemotePluginQuery.toLowerCase();
      return this.remotePlugins.filter(plugin => {
        const matchName = plugin.name && plugin.name.toLowerCase().includes(query);
        const matchDesc = plugin.description && plugin.description.toLowerCase().includes(query);
        return matchName || matchDesc;
      });
    },

    // Return the dynamically filtered extension list
    filteredExtensions() {
      // Return the original list if the search box is empty
      if (!this.searchExtensionQuery) {
        return this.extensions; 
      }
      
      const query = this.searchExtensionQuery.toLowerCase();
      
      // Match extension names or descriptions approximately
      return this.extensions.filter(ext => {
        const matchName = ext.name && ext.name.toLowerCase().includes(query);
        const matchDesc = ext.description && ext.description.toLowerCase().includes(query);
        return matchName || matchDesc;
      });
    },

  favoriteExtensions() {
    return this.extensions.filter(ext => this.favoriteExtensionIds.includes(ext.id));
  },

  dockerBasicCommand() {
    return this.dockerExamples;
  },
  
  dockerComposeCommand() {
    return this.dockerExamples2;
  },

    // Dynamically filter table data
    filteredAffectionData() {
      console.log("Computed property updated; current data length:", this.affectionDataList.length);
      // Check that the underlying data exists
      if (!this.affectionDataList || this.affectionDataList.length === 0) {
        return [];
      }
      
      // Return the complete array if there is no search term
      if (!this.affectionSearchQuery) {
        return this.affectionDataList;
      }
      
      const query = this.affectionSearchQuery.toLowerCase();
      return this.affectionDataList.filter(item => {
        // Ensure userName exists before filtering
        return item.userName && item.userName.toLowerCase().includes(query);
      });
    },
    // Diary: reverse chronological order and search filtering
    filteredDiaryEntries() {
      let list = Array.isArray(this.diaryEntries) ? this.diaryEntries.slice() : [];
      list.sort((a, b) => new Date(b.time) - new Date(a.time));
      if (this.diarySearchQuery) {
        const q = this.diarySearchQuery.toLowerCase();
        list = list.filter(e =>
          (e.content && e.content.toLowerCase().includes(q)) ||
          (e.title && e.title.toLowerCase().includes(q)) ||
          (e.type && e.type.toLowerCase().includes(q))
        );
      }
      return list;
    },
    // Diary trigger interval range (two-way binding for el-slider range)
    diaryIntervalRange: {
      get() {
        return [this.diarySettings.minMinutes, this.diarySettings.maxMinutes];
      },
      set(val) {
        if (!Array.isArray(val)) return;
        this.diarySettings.minMinutes = val[0];
        this.diarySettings.maxMinutes = val[1];
        this.autoSaveSettings();
      }
    },
    computedSkillsList() {
      const skillMap = new Map();
      
      // 1. Populate global skills
      this.skillsList.forEach(skill => {
        skillMap.set(skill.id, {
          ...skill,
          isGlobal: true,
          isProject: false
        });
      });

      // 2. Add project-only skills or mark skills present in the project
      this.projectSkillsDetails.forEach(skill => {
        if (skillMap.has(skill.id)) {
          skillMap.get(skill.id).isProject = true;
        } else {
          skillMap.set(skill.id, {
            ...skill,
            isGlobal: false,
            isProject: true
          });
        }
      });

      return Array.from(skillMap.values());
    },
    // Shortcut popup: fragment typed after / (null if no match)
    shortcutMenuToken() {
      if (!this.systemSettings || !this.systemSettings.enableShortcuts) return null;
      const m = /^\/(\S*)$/.exec(this.userInput || '');
      return m ? m[1].toLowerCase() : null;
    },
    // Shortcut popup: filtered candidate list
    shortcutMenuItems() {
      const token = this.shortcutMenuToken;
      if (token === null) return [];
      const cliEnabled = !!(this.CLISettings && this.CLISettings.enabled);
      const runIds = ['help', 'new', 'stop', 'retry', 'skills'];
      const fillIds = ['model', 'personality'];
      const modeIds = ['mode_plan', 'mode_read', 'mode_edit', 'mode_yolo', 'mode_cowork', 'mode_goal'];
      const items = [];
      (this.shortcutCommands || []).forEach(c => {
        if (!runIds.includes(c.id) && !fillIds.includes(c.id) && !modeIds.includes(c.id)) return;
        if (c.requiresCli && !cliEnabled) return; // Requires computer CLI control
        const word = (c.syntax || '').split(/\s+/)[0];
        const names = [word, ...(c.aliases || [])];
        const match = !token || names.some(n => n.toLowerCase().startsWith('/' + token));
        if (!match) return;
        items.push({
          key: c.id,
          label: word,
          aliases: c.aliases || [],
          desc: this.t(c.descKey),
          mode: fillIds.includes(c.id) ? 'fill' : 'run',
          insert: word,
          isSkill: false
        });
      });
      if (cliEnabled) {
        (this.computedSkillsList || []).forEach(s => {
          const name = s.name || s.id;
          if (!name) return;
          const word = '/' + name;
          if (token && !word.toLowerCase().startsWith('/' + token)) return;
          items.push({
            key: 'skill:' + (s.id || name),
            label: word,
            aliases: [],
            desc: s.description || this.t('cmd_skill_desc'),
            mode: 'fill',
            insert: word,
            isSkill: true
          });
        });
      }
      return items;
    },
    hasWorkspacePath() {
        return this.CLISettings && 
               this.CLISettings.cc_path && 
               this.CLISettings.cc_path.trim() !== '';
    },
    dynamicUserAgent() {
      // 1. Define a recent Chrome version; update periodically for compatibility
      // Chrome 124+ is the inherited compatibility baseline
      const chromeVersion = '124.0.0.0'; 
      
      // 2. Base template
      const baseUA = `Mozilla/5.0 ({os_info}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
      
      // 3. Determine the current platform
      // Electron Renderer can generally use global.process or navigator
      let platform = '';
      
      // Prefer Node's process.platform
      if (typeof window.process !== 'undefined' && window.process.platform) {
        platform = window.process.platform;
      } else {
        // Fallback: inspect navigator.userAgent
        const navUA = navigator.userAgent.toLowerCase();
        if (navUA.indexOf('mac') > -1) platform = 'darwin';
        else if (navUA.indexOf('win') > -1) platform = 'win32';
        else platform = 'linux';
      }

      // 4. Set OS information according to platform
      let osInfo = '';
      switch (platform) {
        case 'darwin': // macOS
          // Generic macOS Intel/M1 identifier
          osInfo = 'Macintosh; Intel Mac OS X 10_15_7';
          break;
        case 'win32': // Windows
          // Windows 10/11 64-bit identifier
          osInfo = 'Windows NT 10.0; Win64; x64';
          break;
        case 'linux': // Linux
          // Standard Linux x64 identifier
          osInfo = 'X11; Linux x86_64';
          break;
        default:
          // Default to Windows
          osInfo = 'Windows NT 10.0; Win64; x64';
      }

      // 5. Return the complete substituted string
      return baseUA.replace('{os_info}', osInfo);
    },

    isCurrentTabFavorite() {
        // Return false if there is no current tab or URL (such as a new tab)
        if (!this.currentTab || !this.currentTab.url) return false;
        // Check whether the current URL is bookmarked
        return this.favorites.some(f => f.url === this.currentTab.url);
    },

    sidePanelText() {
      if (this.messages.length === 0) {
        return '';
      }
      
      // Filter assistant messages and sort in reverse chronological order
      const assistantMessages = this.messages
        .filter(msg => msg.role === 'assistant')
        .reverse();
      
      // Find the first nonempty message
      for (const msg of assistantMessages) {
        if (msg.pure_content && msg.pure_content.trim() !== '') {
          return msg.pure_content;
        }
      }
      
      // No matching message was found
      return '';
    },
    currentViewName() {
      return this.currentExtension ? this.currentExtension.name : this.t('defaultView');
    },
    /* Computed property: default template */
    defaultSidePanelHTML() {
      // Use the custom template if the user supplied one
      if (this.sidePanelHTML) return this.sidePanelHTML;

      return `
        <div class="side-panel-default">
          <div class="side-panel-content markdown-body" v-data-mjx-disabled="true">
            ${this.formatMessage(this.sidePanelText)}
          </div>
        </div>`;
    },
    noInputFlag() {
      return !this.TTSrunning &&
             !this.ASRrunning &&
             !this.isInputting &&
             !this.isTyping &&
             !this.isOmniPlaying
    },
    // Calculate completion percentage
    processingPercentage() {
      if (this.totalChunksCount === 0) return 0;
      return Math.round((this.audioChunksCount / this.totalChunksCount) * 100);
    },
    
    // Generate progress text
    processingProgressText() {
      if (this.totalChunksCount === 0) return this.t('waiting');
      
      return `${this.audioChunksCount} / ${this.totalChunksCount} (${this.processingPercentage}%)`;
    },
    
    // Set the progress bar color according to status
    progressStatus() {
      if (this.isReadRunning || this.isConvertingAudio) {
        if (this.processingPercentage >= 90) return 'success';
        if (this.processingPercentage >= 50) return '';
        return 'exception';
      }
      return 'success';
    },

    allChecked: {
      get() {
        return this.textFiles.length > 0 && this.selectedFiles.length === this.textFiles.length;
      },
      set(val) {
        this.selectedFiles = val ? this.textFiles.map(f => f.unique_filename) : [];
      }
    },
    indeterminate() {
      return (
        this.selectedFiles.length > 0 &&
        this.selectedFiles.length < this.textFiles.length
      );
    },
    // All images selected
    allImagesChecked: {
      get() {
        return this.imageFiles.length > 0 && 
              this.selectedImages.length === this.imageFiles.length
      },
      set(val) {
        this.selectedImages = val 
          ? this.imageFiles.map(i => i.unique_filename) 
          : []
      }
    },
    
    // Indeterminate image selection: some but not all selected
    indeterminateImages() {
      return (
        this.selectedImages.length > 0 &&
        this.selectedImages.length < this.imageFiles.length
      );
    },

    // All videos selected
    allVideosChecked: {
      get() {
        return this.videoFiles.length > 0 && 
              this.selectedVideos.length === this.videoFiles.length
      },
      set(val) {
        this.selectedVideos = val 
          ? this.videoFiles.map(v => v.unique_filename) 
          : []
      }
    },
    // Indeterminate select-all state
    indeterminateVideos() {
      return (
        this.selectedVideos.length > 0 &&
        this.selectedVideos.length < this.videoFiles.length
      );
    },
    sidebarStyle() {
      return {
        width: this.isMobile ? 
          (this.sidebarVisible ? '200px' : '0') : 
          (this.isCollapse ? '64px' : '200px')
      }
    },
    filteredSeparators() {
      const current = this.ttsSettings.separators || [];
      const defaults = this.defaultSeparators;
      const custom = current
        .filter(s => !defaults.some(d => d.value === s))
        .map(s => ({
          label: `(${this.formatSeparator(s)})`,
          value: s
        }));
      return [...this.defaultSeparators, ...custom];
    },
    filteredClaudeModelProviders() {
      const vendors = ["Anthropic", "customAnthropic", "newapi", "Ollama"];
      // Add modelProviders whose vendor appears in vendors to filteredClaudeModelProviders
      return this.modelProviders.filter((item) => vendors.includes(item.vendor));
    },

    // Computed property: validate configuration
    isTelegramBotConfigValid() {
      return this.telegramBotConfig.bot_token;
    },
    filteredTelegramSeparators() {
      const current = this.telegramBotConfig.separators;
      const defaults = this.defaultSeparators;
      const custom = current
        .filter(s => !defaults.some(d => d.value === s))
        .map(s => ({
          label: `(${this.formatSeparator(s)})`,
          value: s
        }));
      return [...this.defaultSeparators, ...custom];
    },
    isDiscordBotConfigValid() {
      return !!this.discordBotConfig.token;
    },
    filteredDiscordSeparators() {
      const current = this.discordBotConfig.separators;
      const defaults = this.defaultSeparators;
      const custom = current
        .filter(s => !defaults.some(d => d.value === s))
        .map(s => ({
          label: `(${this.formatSeparator(s)})`,
          value: s
        }));
      return [...this.defaultSeparators, ...custom];
    },
    isSlackBotConfigValid() {
      // Slack requires both tokens
      return !!this.slackBotConfig.bot_token && !!this.slackBotConfig.app_token;
    },
    filteredSlackSeparators() {
      const current = this.slackBotConfig.separators;
      const defaults = this.defaultSeparators;
      const custom = current
        .filter(s => !defaults.some(d => d.value === s))
        .map(s => ({
          label: `(${this.formatSeparator(s)})`,
          value: s
        }));
      return [...this.defaultSeparators, ...custom];
    },
    isLiveConfigValid() {
      const youtubeValid = !this.liveConfig.youtube_enabled ||
        (this.liveConfig.youtube_video_id && this.liveConfig.youtube_api_key);
      const twitchValid = !this.liveConfig.twitch_enabled ||
        (this.liveConfig.twitch_channel && this.liveConfig.twitch_access_token);
      return !!((this.liveConfig.youtube_enabled || this.liveConfig.twitch_enabled) &&
        youtubeValid && twitchValid);
    },
    updateButtonText() {
      if (this.updateDownloaded) return this.t('installNow');
      if (this.downloadProgress > 0) return this.t('downloading');
      return this.t('updateAvailable');
    },
    allItems() {
      return [
        ...this.files.map(file => ({ ...file, type: 'file' })),
        ...this.images.map(image => ({ ...image, type: 'image' }))
      ];
    },
    sortedConversations() {
      return [...this.conversations].sort((a, b) => b.timestamp - a.timestamp);
    },
    filteredConversations() {
        const keyword = (this.searchKeyword || '').toLowerCase();
        // 1. Ensure conversations exists and is an array
        if (!Array.isArray(this.conversations)) return [];

        return [...this.conversations]
            .filter(conv => {
                if (!conv) return false;
                // 2. Safely check the title
                const titleMatch = (conv.title || '').toLowerCase().includes(keyword);
                
                // 3. Safely check the messages array and its contents
                const contentMatch = (conv.messages || []).some(msg => 
                    msg && msg.content && String(msg.content).toLowerCase().includes(keyword)
                );
                
                return titleMatch || contentMatch;
            })
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    },
    groupedFilteredConversations() {
      const groups = Array.isArray(this.conversationGroups) ? this.conversationGroups : [];
      const conversations = Array.isArray(this.filteredConversations) ? this.filteredConversations : [];
      const keyword = (this.searchKeyword || '').trim().toLowerCase();

      return groups
        .map(group => ({
          ...group,
          conversations: conversations.filter(conv => (conv.groupId || 'default') === group.id)
        }))
        .filter(group => {
          if (!keyword) return true;
          return group.conversations.length > 0 || (group.name || '').toLowerCase().includes(keyword);
        });
    },
    iconClass() {
      return this.isExpanded ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
    },
    hasEnabledA2AServers() {
      return Object.values(this.a2aServers).some(server => server.enabled);
    },
    hasEnabledLLMTools() {
      return this.llmTools.some(tool => tool.enabled);
    },
    hasEnabledKnowledgeBases() {
      return this.knowledgeBases.some(kb => kb.enabled)
    },
    hasEnabledMCPServers() {
      // Check for an enabled server in this.mcpServers
      return Object.values(this.mcpServers).some(server => !server.disabled);
    },
    hasEnabledHttpTools() {
      return this.customHttpTools.some(tool => tool.enabled);
    },
    hasEnabledComfyUI() {
      return this.workflows.some(tool => tool.enabled);
    },
    hasEnabledStickerPacks() {
      return this.stickerPacks.some(pack => pack.enabled);
    },
    hasFiles() {
      return this.files.length > 0
    },
    hasImages() {
      return this.images.length > 0
    },
    formValid() {
      return !!this.newLLMTool.name && !!this.newLLMTool.type
    },
    isEditingBehavior() {
      return this.currentBehaviorIndex !== -1;
    },
    defaultBaseURL() {
      switch(this.newLLMTool.type) {
        case 'openai': 
          return 'https://api.openai.com/v1'
        case 'ollama':
          return this.isdocker ? 
            'http://host.docker.internal:11434' : 
            'http://127.0.0.1:11434'
        default:
          return ''
      }
    },
    defaultApikey() {
      switch(this.newLLMTool.type) {
        case 'ollama':
          return 'ollama'
        default:
          return ''
      }
    },
    validProvider() {
      if (!this.newProviderTemp.vendor) return false
      if (this.newProviderTemp.vendor === 'custom' || this.newProviderTemp.vendor === 'customAnthropic' || this.newProviderTemp.vendor === 'OpenAIResponses') {
        return this.newProviderTemp.url.startsWith('http')
      }
      return true
    },
    vendorOptions() {
      return this.vendorValues.map(value => ({
        label: this.t(`vendor.${value}`), // Use the shared translation key
        value
      }));
    },
  // Filter providers by search term and category
  filteredVendorOptions() {
    return this.vendorOptions.filter(item => {
      // 1. Search filter (case-insensitive value or translated label)
      const keyword = this.searchQuery.toLowerCase();
      const matchSearch = 
        item.value.toLowerCase().includes(keyword) || 
        item.label.toLowerCase().includes(keyword);

      // 2. Category filter
      const isLocal = this.localVendors.includes(item.value);
      let matchCategory = true;
      
      if (this.activeCategory === 'local') {
        matchCategory = isLocal;
      } else if (this.activeCategory === 'cloud') {
        matchCategory = !isLocal;
      }

      // Require both search and category matches
      return matchSearch && matchCategory;
    });
  },

    MCPvendorOptions() {
      return this.MCPvendorValues.map(value => ({
        label: this.t(`MCPvendor.${value}`), // Use the shared translation key
        value
      }));
    },
    PromptOptions() {
      return this.promptValues.map(value => ({
        label: this.t(`prompt.${value}`), // Use the shared translation key
        value
      }));
    },
    CardOptions() {
      return this.cardValues.map(value => ({
        label: this.t(`card.${value}`), // Use the shared translation key
        value
      }));
    },
    themeOptions() {
      return this.themeValues.map(value => ({
        label: this.t(`theme.${value}`),
        value // Retain the original value
      }));
    },
    // Global font baseline: 14px
    currentFontPx() {
      return Math.round((Number(this.systemSettings.fontScale) || 1) * 14);
    },
    // Code-block baseline: 12px (matches .markdown-body pre in github-markdown.css)
    currentCodeFontPx() {
      return Math.round((Number(this.systemSettings.codeFontScale) || 1) * 12);
    },
    // Expose pixels in the dropdown; store the zoom ratio internally
    fontPxModel: {
      get() { return this.currentFontPx; },
      set(px) { this.handleFontScaleChange(px / 14); }
    },
    codeFontPxModel: {
      get() { return this.currentCodeFontPx; },
      set(px) { this.handleCodeFontScaleChange(px / 12); }
    },
    fontSizeOptions() {
      return [12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
    },
    codeFontSizeOptions() {
      return [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    },
    // Appearance settings code-block preview: match the DOM structure generated by highlight() in vue_methods.js
    // so it inherits .code-block zoom, theme and syntax highlighting styles.
    codeBlockPreviewHtml() {
      const sample =
`function greet(name) {
  const message = \`Hello, \${name}!\`;
  console.log(message);
  return message;
}

greet('Super Agent Party');`;
      const escape = s => s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
      try {
        const highlighted = window.hljs
          ? window.hljs.highlight(sample, { language: 'javascript' }).value
          : escape(sample);
        return `<pre class="code-block"><div class="code-header"><span class="code-lang">javascript</span></div><div class="code-content"><code class="hljs language-javascript">${highlighted}</code></div></pre>`;
      } catch (e) {
        return `<pre class="code-block"><div class="code-header"><span class="code-lang">text</span></div><div class="code-content"><code class="hljs">${escape(sample)}</code></div></pre>`;
      }
    },
    hasAgentChanges() {
      return this.mainAgent !== 'super-model' || 
        Object.values(this.agents).some(a => a.enabled)
    },
    // Get all distinct languages
    uniqueLanguages() {
      const languages = [...new Set(this.edgettsvoices.map(voice => voice.language))];
      return languages.sort();
    },
    
    // Get available genders for the selected language
    uniqueGenders() {
      const voicesForLanguage = this.edgettsvoices.filter(voice => 
        voice.language === this.edgettsLanguage
      );
      const genders = [...new Set(voicesForLanguage.map(voice => voice.gender))];
      return genders.sort();
    },
    
    // Filter voices by language and gender
    filteredVoices() {
      return this.edgettsvoices.filter(voice => 
        voice.language === this.edgettsLanguage && 
        voice.gender === this.edgettsGender
      );
    },
    uniqueNewLanguages() {
      const languages = [...new Set(this.edgettsvoices.map(voice => voice.language))];
      return languages.sort();
    },
    uniqueNewGenders() {
      const voicesForLanguage = this.edgettsvoices.filter(voice => 
        voice.language === this.newTTSConfig.edgettsLanguage
      );
      const genders = [...new Set(voicesForLanguage.map(voice => voice.gender))];
      return genders.sort();
    },
    filteredNewVoices() {
      return this.edgettsvoices.filter(voice => 
        voice.language === this.newTTSConfig.edgettsLanguage && 
        voice.gender === this.newTTSConfig.edgettsGender
      );
    },
    selectedVendor() {
      return this.modelProviders.find(
        p => p.id === this.settings.selectedProvider
      );
    },
    currentTab() {
        return this.browserTabs.find(t => t.id === this.currentTabId);
    },
    allItems() {
      // 1. Documents
      const filesWithType = (this.files || []).map(f => ({
        ...f,
        uiCategory: 'file' // Use a distinct name to avoid a collision with file.type
      }));

      // 2. Visual media (images and videos)
      const visualsWithType = (this.images || []).map(img => ({
        ...img,
        uiCategory: 'image' 
      }));

      return [...filesWithType, ...visualsWithType];
    },
    hasAttachments() {
      return this.allItems && this.allItems.length > 0;
    },
    connectedAppCount() {
      const settings = this.localAppControlSettings;
      if (!settings || !settings.connectedApps) return 0;
      return Object.keys(settings.connectedApps).length;
    },
    filteredLocalApps() {
      const apps = this.localAppControlSettings.scannedApps;
      const kw = (this.localAppSearch || "").trim().toLowerCase();
      if (!kw) return apps;
      return apps.filter(a => a.name.toLowerCase().includes(kw));
    },
  },
  methods: {
    ...vue_methods,
  },
directives: {
    morph: {
      mounted(el, binding, vnode) {
        const vm = binding.instance; 
        el._update = (content) => {
           // 1. Parse Markdown
          const html = vm.formatMessage(content, -1);
          const wrapper = document.createElement('div');
          wrapper.innerHTML = html;
           
           // 2. Update the actual DOM
           morphdom(el, wrapper, { 
               childrenOnly: true,
               onBeforeElUpdated: (fromEl, toEl) => {
                   const tag = fromEl.tagName || '';
                   if (tag.startsWith('MJX-') || fromEl.classList.contains('MathJax')) return false;
                   if (fromEl.tagName === 'PRE' && fromEl.isEqualNode(toEl)) return false;
                   return true;
               }
           });
           
            // Call directly without requestAnimationFrame; scrollToBottom handles timing with its own setTimeout
            if (vm && typeof vm.scrollToBottom === 'function') {
                vm.scrollToBottom();
            }
        };
        el._update(binding.value);
      },
      updated(el, binding) {
        if (binding.value !== binding.oldValue) {
           el._update(binding.value);
        }
      }
    }
},
  created() {
      if (this.browserTabs.length > 0) {
          this.currentTabId = this.browserTabs[0].id;
      }
      this.scrollInterval = null;
  },
});

// FontAwesome icon mapping
const NOTIFICATION_ICONS = {
    success: 'fa-solid fa-circle-check',
    error: 'fa-solid fa-circle-xmark',
    warning: 'fa-solid fa-triangle-exclamation',
    info: 'fa-solid fa-circle-info'
};

let notificationTimeout;

// Global collection of active notification instances
const activeNotifications = [];

function showNotification(message, type = 'success', title = '') {
    const iconClass = NOTIFICATION_ICONS[type] || NOTIFICATION_ICONS.info;
    const duration = (type === 'error' || type === 'warning') ? 5000 : 3000;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    notification.innerHTML = `
        <div class="notif-icon-box">
            <i class="${iconClass}"></i>
        </div>
        <div class="notif-content">
            ${title ? `<div class="notif-title">${sanitizeChatHtml(title)}</div>` : ''}
            <div class="notif-desc" style="${!title ? 'color: var(--el-text-color-primary);' : ''}">${sanitizeChatHtml(message)}</div>
        </div>
        <div class="notif-progress" style="transition-duration: ${duration}ms"></div>
    `;

    document.body.appendChild(notification);
    
    // Determine the base top offset (CSS: 16px mobile, 24px desktop)
    const isMobile = window.innerWidth <= 768;
    const BASE_TOP = isMobile ? 16 : 24;
    const GAP = 16; // Spacing between notifications
    
    // Force layout so the actual rendered height is available
    void notification.offsetWidth;
    
    // 1. Calculate this notification's position from the previous notification heights
    let currentTop = BASE_TOP;
    activeNotifications.forEach(n => {
        currentTop += n.offsetHeight + GAP;
    });
    
    // Set inline styles
    notification.style.top = currentTop + 'px';
    // Add to the active queue
    activeNotifications.push(notification);

    requestAnimationFrame(() => {
        notification.classList.add('show');
    });

    let timer = null;

    // Encapsulate close handling
    const closeNotification = () => {
        const index = activeNotifications.indexOf(notification);
        if (index === -1) return; // Prevent duplicate close events

        // 1. Remove the current notification from the queue
        activeNotifications.splice(index, 1);
        
        // 2. Trigger the exit animation
        notification.classList.remove('show');
        notification.classList.add('hide');
        
        // 3. Recalculate remaining positions so notifications slide upward
        let newTop = BASE_TOP;
        activeNotifications.forEach(n => {
            n.style.top = newTop + 'px';
            newTop += n.offsetHeight + GAP;
        });

        // 4. Remove the DOM element after animation
        setTimeout(() => {
            if (notification.parentNode) notification.remove();
        }, 400); 
    };

    // Allow users to dismiss a notification by clicking it
    notification.addEventListener('click', () => {
        clearTimeout(timer);
        closeNotification();
    });

    // Set the auto-dismiss timer
    timer = setTimeout(closeNotification, duration);
}

// Compatible with older calls that provide only a message
// showNotification("Saved successfully"); -> defaults to success
// showNotification("Save failed", "error");
function removeNonAsciiTags(html) {
  // Match all opening and closing tags
  // For example, a tag with a non-ASCII name and its closing tag
  const regex = /<\/?([^\s>]+)[^>]*>/g;
  
  return html.replace(regex, (match, tagName) => {
    // Check whether the tag name contains non-ASCII characters
    const hasNonAscii = [...tagName].some(char => char.charCodeAt(0) > 127);
    
    // Remove tags with non-ASCII names but preserve their contents
    if (hasNonAscii) {
      return '';
    }
    
    // Otherwise retain the tag
    return match;
  });
}

// Icon registration (complete example)
app.use(ElementPlus);

// ==========================================
// Register the A2UI component
// ==========================================
app.component('a2-u-i-renderer', A2UIRendererComponent);

// Register all icons in a single loop
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// Shortcut popup component (drawer menu when input starts with /)
app.component('shortcut-menu', {
  props: {
    items: { type: Array, default: () => [] },
    index: { type: Number, default: 0 }
  },
  emits: ['select', 'hover'],
  template: `
    <div class="shortcut-menu">
      <div v-for="(item, i) in items" :key="item.key"
           class="shortcut-menu-item" :class="{ active: i === index }"
           @mousedown.prevent="$emit('select', item)"
           @mouseenter="$emit('hover', i)">
        <span class="shortcut-menu-cmd">{{ item.label }}</span>
        <span v-if="item.aliases && item.aliases.length" class="shortcut-menu-alias">{{ item.aliases.join('  ') }}</span>
        <span class="shortcut-menu-desc">{{ item.desc }}</span>
      </div>
    </div>
  `
});

// Mount the application
app.mount('#app');
