const md = window.markdownit({
    html: true,
    linkify: true,
    typographer: true,
    highlight: function (str, lang) {
    let language = lang === 'a2ui' || (lang && hljs.getLanguage(lang)) ? lang : 'plaintext';
    const isPotentialMermaid = (code) => {
    // Detect standard syntax patterns
    const mermaidPatterns = [
        // Detect diagram type declaration
        /^\s*(graph|sequenceDiagram|gantt|classDiagram|pie|stateDiagram|gitGraph|journey|flowchart|mindmap|quadrantChart|erDiagram|requirementDiagram|gitGraph|C4Context|timeline|zenuml|sankey-beta|xychart-beta|block-beta|packet-beta|kanban|architecture-beta|radar-beta)\b/i,
        // Detect node relationships
        /-->|==>|:::|\|\|/,
        // Detect style configuration
        /^style\s+[\w]+\s+/im,
        // Detect comment syntax
        /%%\{.*\}\n?/
    ];
    
    return mermaidPatterns.some(pattern => pattern.test(code));
    };
    // Upgrade Mermaid content in plain text
    if (language === 'plaintext' && isPotentialMermaid(str)) {
    language = 'mermaid';
    };
    const previewable = ['html', 'mermaid'].includes(language);
    const downloadButton = previewable ? 
    `<button class="download-button" data-lang="${language}"><i class="fa-solid fa-download"></i></button>` : '';
    // Add preview button
    const previewButton = previewable ? 
    `<button class="preview-button" data-lang="${language}"><i class="fa-solid fa-eye"></i></button>` : '';
    try {
    return `<pre class="code-block"><div class="code-header"><span class="code-lang">${language}</span><div class="code-actions">${previewButton}${downloadButton}<button class="copy-button"><i class="fa-solid fa-copy"></i></button></div></div><div class="code-content"><code class="hljs language-${language}">${hljs.highlight(str, { language }).value}</code></div></pre>`;
    } catch (__) {
    return `<pre class="code-block"><div class="code-header"><span class="code-lang">${language}</span><div class="code-actions">${previewButton}${downloadButton}<button class="copy-button"><i class="fa-solid fa-copy"></i></button></div></div><div class="code-content"><code class="hljs">${md.utils.escapeHtml(str)}</code></div></pre>`;
    }
}
});

// 1. Override the opening table tag to include a wrapper
md.renderer.rules.table_open = function(tokens, idx, options, env, self) {
  // Returns: <div class="markdown-table-wrapper"><table>
  return '<div class="markdown-table-wrapper"><table' + self.renderAttrs(tokens[idx]) + '>';
};

// 2. Override the closing table tag: close table, add button, close wrapper
md.renderer.rules.table_close = function(tokens, idx, options, env, self) {
  // Add download-xlsx-btn for delegated event handling
  // Handle clicks through Vue event delegation rather than inline onclick logic
  return '</table><button class="table-download-btn download-xlsx-trigger" type="button"><i class="fa-solid fa-file-excel"></i> XLSX</button></div>';
};

if (window.markdownitFootnote) {
    md.use(window.markdownitFootnote);
    
    // Override footnote rendering to show only the number without brackets
    md.renderer.rules.footnote_caption = (tokens, idx) => {
        var n = Number(tokens[idx].meta.id + 1).toString();
        return n;
    };
}

if (window.markdownitTaskLists) {
    md.use(window.markdownitTaskLists, {
        enabled: true,   // Render as <input type="checkbox">
        label: true,     // Wrap text in <label>
        labelAfter: true // Place the label after the checkbox
    });
} else {
    console.warn('markdown-it-task-lists not loaded; task lists will not render.');
}

// Check whether the plugin is loaded
if (window.markdownitContainer) {
    
    // 1. Define the warning container (CSS .highlight-block-reasoning)
    // Usage:
    // ::: warning Title
    // Content...
    // :::
    md.use(window.markdownitContainer, 'warning', {
        validate: function(params) {
            return params.trim().match(/^warning\s*(.*)$/);
        },
        render: function (tokens, idx) {
            var m = tokens[idx].info.trim().match(/^warning\s*(.*)$/);
            if (tokens[idx].nesting === 1) {
                // Opening tag: <div class="highlight-block-reasoning"> ...
                var title = m[1] ? md.utils.escapeHtml(m[1]) : '';
                var titleHtml = title ? '<strong>' + title + '</strong><br>' : '';
                return '<div class="highlight-block-reasoning">' + titleHtml;
            } else {
                // Closing tag: </div>
                return '</div>\n\n';
            }
        }
    });

    // 2. Define the info container (CSS .highlight-block)
    // Usage:
    // ::: info Note
    // Content...
    // :::
    md.use(window.markdownitContainer, 'info', {
        validate: function(params) {
            return params.trim().match(/^info\s*(.*)$/);
        },
        render: function (tokens, idx) {
            var m = tokens[idx].info.trim().match(/^info\s*(.*)$/);
            if (tokens[idx].nesting === 1) {
                var title = m[1] ? md.utils.escapeHtml(m[1]) : '';
                var titleHtml = title ? '<strong>' + title + '</strong><br>' : '';
                return '<div class="highlight-block">' + titleHtml;
            } else {
                return '</div>\n\n';
            }
        }
    });
} else {
    console.warn('markdown-it-container not loaded; custom containers will not render.');
}

if (window.texmath) {
    md.use(window.texmath, {
        engine: window.katex, // Use KaTeX as the rendering engine
        delims: 'dollars',    // Use $...$ and $$...$$ syntax
        katexOptions: {
            throwOnError: false,
            output: 'html'    // Force HTML output for streaming rendering
        }
    });
}

const ALLOWED_EXTENSIONS =[
  // Office documents
  'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'pdf', 'pages', 
  'numbers', 'key', 'rtf', 'odt', 'epub',

  // Software development
  'js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs',
  'swift', 'kt', 'dart', 'rb', 'php', 'html', 'css', 'scss', 'less',
  'vue', 'svelte', 'jsx', 'tsx', 'json', 'xml', 'yml', 'yaml', 
  'sql', 'sh',

  // Data and configuration
  'csv', 'tsv', 'txt', 'md', 'log', 'conf', 'ini', 'env', 'toml'
];

// MIME type allowlist
const MIME_WHITELIST =[
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/pdf',
  'application/json',
  'text/csv',
  'text/x-python',
  'application/xml',
  'text/x-go',
  'text/x-rust',
  'text/x-swift',
  'text/x-kotlin',
  'text/x-dart',
  'text/x-ruby',
  'text/x-php'
];

// Image upload configuration
const ALLOWED_IMAGE_EXTENSIONS =['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
const IMAGE_MIME_WHITELIST =[
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp'
];

// Video upload configuration
const ALLOWED_VIDEO_EXTENSIONS =['mp4', 'webm', 'ogg', 'mov', 'avi'];
const VIDEO_MIME_WHITELIST =[
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo'
];

// Include video extensions in the complete allowlist
const ALL_ALLOWED_EXTENSIONS = [...new Set([
  ...ALLOWED_EXTENSIONS, 
  ...ALLOWED_IMAGE_EXTENSIONS, 
  ...ALLOWED_VIDEO_EXTENSIONS // Include video extensions
])];

let vue_methods = {
  stringifyEntityId(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    return String(value);
  },
  handleUpdateAction() {
    if (this.updateDownloaded) {
      window.electronAPI.quitAndInstall();
    } else if (this.updateAvailable) {
      window.electronAPI.downloadUpdate();
    }
  },
formatFileUrl(originalUrl) {
    if (!this.isElectron) {
      try {
        const url = new URL(originalUrl);
        // Replace 0.0.0.0 with the current hostname
        if (url.hostname === '0.0.0.0' || url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
          url.hostname = window.location.hostname;
          url.protocol = window.location.protocol;
          
          // Rewrite the port only when absent, the default 3456, or the active port
          const isBackendPort = url.port === '' || url.port === '3456' || url.port === window.location.port;
          if (isBackendPort) {
            url.port = window.location.port;
          }
        }
        return url.toString();
      } catch(e) {
        return originalUrl;
      }
    }
    else {
      try {
        const url = new URL(originalUrl);
        if (url.hostname === '127.0.0.1') {
          url.hostname = "localhost";
          url.protocol = window.location.protocol;
          
          // Rewrite the port only when absent, the default 3456, or the active port
          const isBackendPort = url.port === '' || url.port === '3456' || url.port === window.location.port;
          if (isBackendPort) {
            url.port = window.location.port;
          }
        }
        return url.toString();
      } catch(e) {
        return originalUrl;
      }
    }
    return originalUrl;
  },
  async resetMessage(index) {
    this.messages[index].content = " ";
    this.system_prompt = " ";
    await this.autoSaveSettings();
  },

  async deleteMessage(index) {
    this.stopGenerate();
    this.messages.splice(index, 1);
    if (this.conversationId === null) {
        this.conversationId = uuid.v4();
        const newConv = {
            id: this.conversationId,
            title: this.generateConversationTitle(messagesPayload),
            mainAgent: this.mainAgent,
            groupId: this.activeConversationGroupId || this.draftConversationGroupId || 'default',
            timestamp: Date.now(),
            messages: this.messages,
            fileLinks: this.fileLinks,
            system_prompt: this.system_prompt,
        };
        this.conversations.unshift(newConv);
    } else {
        const conv = this.conversations.find(conv => conv.id === this.conversationId);
        if (conv) {
            conv.messages = this.messages;
            conv.timestamp = Date.now();
            conv.fileLinks = this.fileLinks;
            conv.groupId = conv.groupId || this.activeConversationGroupId || this.draftConversationGroupId || 'default';
        }
    }
    await this.autoSaveSettings();
    await this.saveConversations();
    console.log("delete message");
  },

  openEditDialog(type, content, index = null) {
    this.editType = type;
    this.editContent = content;
    this.editIndex = index;
    this.showEditDialog = true;
    this.selectSystemPromptId =null;
  },
  async saveEdit() {
    this.showEditDialog = false;
    if (this.editType === 'system') {
      this.system_prompt = this.editContent;
      this.syncSystemPromptToMessages(this.system_prompt);
    }
    if (this.editType === 'user') {
      // Remove all messages after this.editIndex
      this.messages.splice(this.editIndex);
      this.userInput = this.editContent;
      this.stopGenerate();
      await this.sendMessage();
    }else{
      // this.messages[this.editIndex].pure_content = this.editContent; // Update the message at this.editIndex
    }
    await this.autoSaveSettings();
  },
    async addParam() {
      this.settings.extra_params.push({
        name: '',
        type: 'string',  // Default type
        value: ''        // Initialize based on type
      });
      await this.autoSaveSettings();
    },

    async addFastParam() {
      this.fastSettings.extra_params.push({
        name: '',
        type: 'string',  // Default type
        value: ''        // Initialize based on type
      });
      await this.autoSaveSettings();
    },

    isInvalidJson(param) {
      // Skip JSON validation for non-JSON types
      if (param.type !== 'json') return false;
      
      // Empty or whitespace-only values are invalid
      if (!param.value || param.value.trim() === '') return true; 

      try {
        const parsed = JSON.parse(param.value);
        
        // JSON type excludes ordinary primitive types (string, integer, boolean)
        // Require a parsed object or array, not null
        if (typeof parsed !== 'object' || parsed === null) {
          return true;
        }
        
        return false; // Valid parsed object or array
      } catch (e) {
        return true; // Invalid JSON syntax
      }
    },

  getParamPlaceholder(type) {
    if (type === 'dict') return '{"type": "enabled"}';
    if (type === 'list') return '["item1", "item2"]';
    return this.t('paramValue'); // Use the translated default
  },

    async updateParamType(index) {
      const param = this.settings.extra_params[index];
      switch(param.type) {
        case 'json':
          param.value = '{}'; // Default to an object; users may change it to an array
          break;
        case 'boolean':
          param.value = false;
          break;
        case 'integer':
        case 'float':
          param.value = 0;
          break;
        default:
          param.value = '';
      }
      await this.autoSaveSettings();
    },

    async updateFastParamType(index) {
      const param = this.fastSettings.extra_params[index];
      // Initialize value based on type
      switch(param.type) {
        case 'json':
          param.value = '{}'; // Default to an object; users may change it to an array
          break;
        case 'boolean':
          param.value = false;
          break;
        case 'integer':
        case 'float':
          param.value = 0;
          break;
        default:
          param.value = '';
      }
      await this.autoSaveSettings();
    },


    // Add from suggested parameters
    async addMainSuggestedParam(param) {
      if (this.paramExistsInMain(param.name)) return;
      this.settings.extra_params.push({
        name: param.name,
        type: param.type,
        value: param.default !== undefined ? param.default : (param.type === 'boolean' ? false : (param.type === 'json' ? '{}' : (param.type === 'integer' || param.type === 'float' ? 0 : '')))
      });
      await this.autoSaveSettings();
    },
    async addFastSuggestedParam(param) {
      if (this.paramExistsInFast(param.name)) return;
      this.fastSettings.extra_params.push({
        name: param.name,
        type: param.type,
        value: param.default !== undefined ? param.default : (param.type === 'boolean' ? false : (param.type === 'json' ? '{}' : (param.type === 'integer' || param.type === 'float' ? 0 : '')))
      });
      await this.autoSaveSettings();
    },
    paramExistsInMain(name) {
      return this.settings.extra_params.some(p => p.name === name);
    },
    paramExistsInFast(name) {
      return this.fastSettings.extra_params.some(p => p.name === name);
    },
    // Look up vendor from providerId
    getVendorByProviderId(providerId) {
      if (!providerId) return null;
      const provider = this.modelProviders.find(p => p.id === providerId);
      return provider ? provider.vendor : null;
    },
    async removeParam(index) {
      this.settings.extra_params.splice(index, 1);
      await this.autoSaveSettings();
    },
    async removeFastParam(index) {
      this.fastSettings.extra_params.splice(index, 1);
      await this.autoSaveSettings();
    },

    switchTollmTools() {
      this.activeMenu = 'toolkit';
      this.subMenu = 'llmTool';
    },
    switchToHttpTools() {
      this.activeMenu = 'toolkit';
      this.subMenu = 'customHttpTool';
    },
    switchToComfyui() {
      this.activeMenu = 'toolkit';
      this.subMenu = 'comfyui';
    },
    switchToStickerPacks() {
      this.activeMenu = 'role';
      this.subMenu = 'sticker';
    },
    switchToVisionControl() {
      this.activeMenu = 'toolkit';
      this.subMenu = 'visionControl';
    },
    switchToDesktopVision() {
      this.activeMenu = 'role';
      this.subMenu = 'vision';
    },
    switchToMainAgent() {
      this.activeMenu = 'api-group';
      this.subMenu = 'agents';
    },
    switchToTTS() {
      this.activeMenu = 'model-config';
      this.subMenu = 'tts';
    },
    switchToExtensionPage() {
      this.activeMenu = 'api-group';
      this.subMenu = 'extension';
    },
    cancelLLMTool() {
      this.showLLMForm = false
      this.resetForm()
    },
    handleTypeChange(val) {
      this.newLLMTool.base_url = this.defaultBaseURL
      this.newLLMTool.api_key = this.defaultApikey
      this.fetchModelsForType(val)
    },
    changeImgHost(val) {
      this.BotConfig.img_host = val;
      this.autoSaveSettings()
    },
    // Get model list
    async fetchModelsForType(type) {
      try {
        const response = await fetch(`/llm_models`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: type,
            base_url: this.newLLMTool.base_url,
            api_key: this.newLLMTool.api_key
          })
        })
        
        const { data } = await response.json()
        this.modelOptions = data.models || []
      } catch (error) {
        console.error('Failed to fetch models:', error)
      }
    },
    // Save tool
    saveLLMTool() {
      const tool = { ...this.newLLMTool }
      // Add tool ID
      tool.id = uuid.v4();
      if (this.editingLLM) {
        this.llmTools[this.editingLLM] = tool
      } else {
        this.llmTools.push(tool)
      }
      this.showLLMForm = false
      this.resetForm()
      this.autoSaveSettings()
    },
    // Delete tool
    removeLLMTool(index) {
      this.llmTools.splice(index, 1)
      this.autoSaveSettings()
    },
    // Reset form
    resetForm() {
      this.newLLMTool = {
        name: '',
        type: 'openai',
        description: '',
        base_url: '',
        api_key: '',
        model: '',
        enabled: true
      }
      this.editingLLM = null
    },
    // Convert type labels
    toolTypeLabel(type) {
      const found = this.llmInterfaceTypes.find(t => t.value === type)
      return found ? found.label : type
    },
    // Check for updates
    async checkForUpdates() {
      if (isElectron) {
        try {
          await window.electronAPI.checkForUpdates();
        } catch (err) {
          showNotification(err.message, 'error');
        }
      }
    },

    // Download update
    async downloadUpdate() {
      if (isElectron && this.updateAvailable) {
        try {
          await window.electronAPI.downloadUpdate();
        } catch (err) {
          showNotification(err.message, 'error');
        }
      }
    },

    // Install update
    async installUpdate() {
      if (isElectron && this.updateDownloaded) {
        await window.electronAPI.quitAndInstall();
      }
    },

    // Handle update button clicks
    async handleUpdate() {
      if (!this.updateSuccess) {
        try {
          await this.downloadUpdate();
          this.updateSuccess = true;
          setTimeout(() => {
            this.installUpdate();
          }, 1000);
        } catch (err) {
          showNotification(err.message, 'error');
        }
      } else {
        await this.installUpdate();
      }
    },

    generateConversationTitle(messages) {
      const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
      
      if (lastUserMessage) {
        let textContent;
        
        // Determine whether content is a string or an array of objects
        if (typeof lastUserMessage.content === 'string') {
          textContent = lastUserMessage.content;
        } else if (Array.isArray(lastUserMessage.content)) {
          // Extract and concatenate text content
          textContent = lastUserMessage.content.filter(item => item.type === 'text')
                           .map(item => item.text).join(' ');
        } else {
          // Use an empty string or other default for unsupported content types
          textContent = '';
        }
    
        // Append fileLinks_content when present
        const fullContent = textContent + (lastUserMessage.fileLinks_content ?? '');
        
        return fullContent.substring(0, 30) + (fullContent.length > 30 ? '...' : '');
      }
      
      return this.t('newChat');
    },
    ensureConversationCreated() {
      // Create the conversation early, assigning conversationId on the first message,
      // so 30-second incremental saves work during lengthy streamed replies such as deep research.
      if (this.conversationId === null) {
        this.conversationId = uuid.v4();
        const newConv = {
          id: this.conversationId,
          title: this.generateConversationTitle(this.messages),
          mainAgent: this.mainAgent,
          groupId: this.activeConversationGroupId || this.draftConversationGroupId || 'default',
          timestamp: Date.now(),
          messages: this.messages,
          fileLinks: this.fileLinks,
          system_prompt: this.system_prompt,
        };
        this.conversations.unshift(newConv);
        const MAX_CONVERSATIONS = 50;
        if (this.conversations.length > MAX_CONVERSATIONS) {
          this.conversations = this.conversations.slice(0, MAX_CONVERSATIONS);
        }
      } else {
        // Guard against missing values to avoid read errors
        const conv = this.conversations.find(conv => conv.id === this.conversationId);
        if (conv) {
          conv.messages = this.messages;
          conv.timestamp = Date.now();
          conv.fileLinks = this.fileLinks;
          conv.groupId = conv.groupId || this.activeConversationGroupId || this.draftConversationGroupId || 'default';
        }
      }
    },
    openDeleteConversationDialog(conversation) {
      if (!conversation?.id) return;
      this.deleteConversationForm = {
        id: conversation.id,
        title: conversation.title || this.t('untitled'),
        deleteMemory: false,
      };
      this.showDeleteConversationDialog = true;
    },
    async confirmDeleteConversation(convId) {
      const conversation = this.conversations.find(c => c.id === convId);
      if (!conversation) return;
      this.openDeleteConversationDialog(conversation);
    },
    ensureConversationGroups() {
      const defaultGroup = {
        id: 'default',
        name: this.t('defaultConversationGroup'),
        createdAt: 0,
        memoryConfig: {}
      };

      const rawGroups = Array.isArray(this.conversationGroups) ? this.conversationGroups : [];
      const groups = rawGroups
        .filter(group => group && group.id && group.id !== 'default')
        .map(group => ({
          ...group,
          memoryConfig: group.memoryConfig || {}
        }));

      this.conversationGroups = [defaultGroup, ...groups];
      if (Array.isArray(this.conversations)) {
        this.conversations.forEach(conv => {
          if (!conv.groupId) {
            conv.groupId = 'default';
          }
        });
      }
      const nextCollapsedState = { ...(this.collapsedConversationGroups || {}) };
      this.conversationGroups.forEach(group => {
        if (typeof nextCollapsedState[group.id] !== 'boolean') {
          nextCollapsedState[group.id] = false;
        }
      });
      Object.keys(nextCollapsedState).forEach(groupId => {
        if (!this.conversationGroups.some(group => group.id === groupId)) {
          delete nextCollapsedState[groupId];
        }
      });
      this.collapsedConversationGroups = nextCollapsedState;

      if (!this.conversationGroups.some(group => group.id === this.draftConversationGroupId)) {
        this.draftConversationGroupId = 'default';
      }
      if (!this.conversationGroups.some(group => group.id === this.activeConversationGroupId)) {
        this.activeConversationGroupId = this.draftConversationGroupId || 'default';
      }
    },
    setActiveConversationGroup(groupId = 'default') {
      this.ensureConversationGroups();
      const nextGroupId = this.conversationGroups.some(group => group.id === groupId) ? groupId : 'default';
      this.activeConversationGroupId = nextGroupId;
      this.draftConversationGroupId = nextGroupId;
    },
    isConversationGroupCollapsed(groupId = 'default') {
      return !!this.collapsedConversationGroups?.[groupId];
    },
    toggleConversationGroupCollapsed(groupId = 'default') {
      this.ensureConversationGroups();
      this.collapsedConversationGroups = {
        ...(this.collapsedConversationGroups || {}),
        [groupId]: !this.isConversationGroupCollapsed(groupId),
      };
    },
    toggleChatHistoryPanel() {
      if (this.isMobile) {
        this.showHistoryDialog = true;
        return;
      }
      this.chatHistoryPanelOpen = !this.chatHistoryPanelOpen;
    },
    createConversationGroup() {
      this.conversationGroupDialogMode = 'create';
      this.conversationGroupForm = {
        id: null,
        name: '',
        memoryEnabled: false,
      };
      this.showConversationGroupDialog = true;
    },
    openRenameConversationGroupDialog(group) {
      if (!group?.id || group.id === 'default') return;
      this.conversationGroupDialogMode = 'rename';
      this.conversationGroupForm = {
        id: group.id,
        name: group.name || '',
        memoryEnabled: !!group.memoryConfig?.enabled,
      };
      this.showConversationGroupDialog = true;
    },
    async submitConversationGroupDialog() {
      this.ensureConversationGroups();
      const name = String(this.conversationGroupForm?.name || '').trim();
      if (!name) {
        showNotification(this.t('groupNameRequired'), 'error');
        return;
      }

      const currentGroupId = this.conversationGroupForm?.id || null;
      const exists = this.conversationGroups.some(group =>
        group.id !== currentGroupId && (group.name || '').trim() === name
      );
      if (exists) {
        showNotification(this.t('groupNameExists'), 'error');
        return;
      }

      if (this.conversationGroupDialogMode === 'rename' && currentGroupId) {
        const targetGroup = this.conversationGroups.find(group => group.id === currentGroupId);
        if (!targetGroup) return;
        targetGroup.name = name;
        targetGroup.memoryConfig = {
          ...(targetGroup.memoryConfig || {}),
          enabled: !!this.conversationGroupForm?.memoryEnabled,
        };
        await this.saveConversations();
        this.showConversationGroupDialog = false;
        showNotification(this.t('groupRenamed'), 'success');
        return;
      }

      const newGroup = {
        id: uuid.v4(),
        name,
        createdAt: Date.now(),
        memoryConfig: {
          enabled: !!this.conversationGroupForm?.memoryEnabled,
        }
      };

      this.conversationGroups.push(newGroup);
      this.draftConversationGroupId = newGroup.id;
      this.activeConversationGroupId = newGroup.id;
      await this.saveConversations();
      this.showConversationGroupDialog = false;
      showNotification(this.t('groupCreated'), 'success');
    },
    async startConversationInGroup(groupId = null) {
      this.ensureConversationGroups();
      const targetGroupId = groupId || this.activeConversationGroupId || this.draftConversationGroupId || 'default';
      this.setActiveConversationGroup(targetGroupId);
      await this.clearMessages(targetGroupId);
    },
    async moveConversationToGroup(convId, groupId) {
      this.ensureConversationGroups();
      const targetGroupId = groupId || 'default';
      const conversation = this.conversations.find(conv => conv.id === convId);
      if (!conversation) return;

      conversation.groupId = targetGroupId;
      if (convId === this.conversationId) {
        this.draftConversationGroupId = targetGroupId;
        this.activeConversationGroupId = targetGroupId;
      }
      await this.saveConversations();
    },
    openDeleteGroupDialog(group) {
      if (!group?.id || group.id === 'default') return;
      this.deleteGroupForm = {
        id: group.id,
        name: group.name || '',
        conversationCount: this.conversations.filter(conv => (conv.groupId || 'default') === group.id).length,
      };
      this.showDeleteGroupDialog = true;
    },
    getDeleteGroupWarningText() {
      const count = this.deleteGroupForm?.conversationCount || 0;
      return String(this.t('deleteGroupWillDeleteChats')).replace('{count}', count);
    },
    async deleteConversationById(conversationId, options = {}) {
      const response = await fetch('/api/conversations/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: this.stringifyEntityId(conversationId),
          delete_memory: !!options.deleteMemory,
        }),
      });

      if (!response.ok) {
        throw new Error('delete_failed');
      }

      if (conversationId === this.conversationId) {
        this.conversationId = null;
        this.messages = [{ id: Date.now() + Math.random(), role: 'system', content: this.system_prompt }];
        this.fileLinks = [];
      }

      this.conversations = this.conversations.filter(c => c.id !== conversationId);
    },
    async clearGroupMemoriesByGroupId(groupId) {
      const response = await fetch('/api/group-memory/clear-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: this.stringifyEntityId(groupId),
        }),
      });

      if (!response.ok) {
        throw new Error('delete_failed');
      }
    },
    async clearAllGroupMemories() {
      const response = await fetch('/api/group-memory/clear-all', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('delete_failed');
      }
    },
    async clearAllHistoryRecords() {
      try {
        await this.$confirm(this.t('confirmClearAllHistory'), this.t('warning'), {
          confirmButtonText: this.t('confirm'),
          cancelButtonText: this.t('cancel'),
          type: 'warning'
        });

        const conversationIds = this.conversations.map(conv => conv.id);
        for (const conversationId of conversationIds) {
          await this.deleteConversationById(conversationId, {
            deleteMemory: true,
          });
        }
        await this.clearAllGroupMemories();

        this.conversationId = null;
        this.messages = [{ id: Date.now() + Math.random(), role: 'system', content: this.system_prompt }];
        this.fileLinks = [];
        this.conversationGroups = [{
          id: 'default',
          name: this.t('defaultConversationGroup'),
          createdAt: 0,
          memoryConfig: {}
        }];
        this.collapsedConversationGroups = { default: false };
        this.activeConversationGroupId = 'default';
        this.draftConversationGroupId = 'default';
        await this.saveConversations();
      } catch (error) {
        if (error?.message === 'delete_failed') {
          showNotification(this.t('deleteFailed') || 'Delete failed', 'error');
        }
      }
    },
    async pruneHistoryToLastWeek() {
      try {
        await this.$confirm(this.t('confirmKeepLastWeek'), this.t('warning'), {
          confirmButtonText: this.t('confirm'),
          cancelButtonText: this.t('cancel'),
          type: 'warning'
        });

        const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const expiredConversationIds = this.conversations
          .filter(conv => !conv.timestamp || conv.timestamp < oneWeekAgo)
          .map(conv => conv.id);

        for (const conversationId of expiredConversationIds) {
          await this.deleteConversationById(conversationId, {
            deleteMemory: true,
          });
        }

        if (this.conversations.length === 0) {
          this.conversationId = null;
          this.messages = [{ id: Date.now() + Math.random(), role: 'system', content: this.system_prompt }];
          this.fileLinks = [];
        }

        await this.saveConversations();
      } catch (error) {
        if (error?.message === 'delete_failed') {
          showNotification(this.t('deleteFailed') || 'Delete failed', 'error');
        }
      }
    },
    async deleteConversationGroup(groupId, options = {}) {
      this.ensureConversationGroups();
      if (!groupId || groupId === 'default') return;

      const groupConversationIds = this.conversations
        .filter(conv => (conv.groupId || 'default') === groupId)
        .map(conv => conv.id);

        for (const conversationId of groupConversationIds) {
          await this.deleteConversationById(conversationId, {
            deleteMemory: true,
          });
        }
        await this.clearGroupMemoriesByGroupId(groupId);

        this.conversationGroups = this.conversationGroups.filter(group => group.id !== groupId);

      if (this.draftConversationGroupId === groupId) {
        this.draftConversationGroupId = 'default';
      }
      if (this.activeConversationGroupId === groupId) {
        this.activeConversationGroupId = 'default';
      }

      await this.saveConversations();
      if (!options.silent) {
        showNotification(this.t('groupDeleted'), 'success');
      }
    },

    async clearConversationGroupChats(groupId) {
      this.ensureConversationGroups();
      if (!groupId) return;
      try {
        await this.$confirm(this.t('clearGroupChatsConfirm'), this.t('warning'), {
          confirmButtonText: this.t('confirm'),
          cancelButtonText: this.t('cancel'),
          type: 'warning'
        });

        const groupConversationIds = this.conversations
          .filter(conv => (conv.groupId || 'default') === groupId)
          .map(conv => conv.id);

        for (const conversationId of groupConversationIds) {
          await this.deleteConversationById(conversationId, {
            deleteMemory: true,
          });
        }
        await this.clearGroupMemoriesByGroupId(groupId);

        if (this.conversationId === null) {
          this.messages = [{ id: Date.now() + Math.random(), role: 'system', content: this.system_prompt }];
          this.fileLinks = [];
        }

        await this.saveConversations();
        showNotification(this.t('groupChatsCleared'), 'success');
      } catch (error) {
        if (error?.message === 'delete_failed') {
          showNotification(this.t('deleteFailed') || 'Delete failed', 'error');
        }
      }
    },

    async confirmDeleteGroupDeletion() {
      const groupId = this.deleteGroupForm?.id;
      if (!groupId) return;
      try {
        await this.deleteConversationGroup(groupId);
        this.showDeleteGroupDialog = false;
      } catch (error) {
        showNotification(this.t('deleteFailed') || 'Delete failed', 'error');
      }
    },
    openRenameConversationDialog(conversation) {
      if (!conversation?.id) return;
      this.conversationRenameForm = {
        id: conversation.id,
        name: conversation.title || '',
      };
      this.showConversationRenameDialog = true;
    },
    async submitConversationRename() {
      const name = String(this.conversationRenameForm?.name || '').trim();
      if (!name) {
        showNotification(this.t('conversationNameRequired'), 'error');
        return;
      }
      const conversation = this.conversations.find(conv => conv.id === this.conversationRenameForm?.id);
      if (!conversation) return;
      conversation.title = name;
      await this.saveConversations();
      this.showConversationRenameDialog = false;
      showNotification(this.t('conversationRenamed'), 'success');
    },
    async confirmDeleteConversationDeletion() {
      const conversationId = this.deleteConversationForm?.id;
      if (!conversationId) return;
      try {
        await this.deleteConversationById(conversationId, {
          deleteMemory: !!this.deleteConversationForm?.deleteMemory,
        });
      } catch (error) {
        showNotification(this.t('deleteFailed') || 'Delete failed', 'error');
        return;
      }
      await this.saveConversations();
      this.showDeleteConversationDialog = false;
      showNotification(this.t('conversationDeleted'), 'success');
    },
    async loadConversation(convId) {
      const conversation = this.conversations.find(c => c.id === convId);
      if (conversation) {
        console.log("convid:"+convId);
        this.conversationId = convId;
        this.messages = [...conversation.messages];
        this.fileLinks = conversation.fileLinks;
        this.mainAgent = conversation.mainAgent;
        this.showHistoryDialog = false;
        this.system_prompt = conversation.system_prompt?conversation.system_prompt:" ";
        this.draftConversationGroupId = conversation.groupId || 'default';
        this.activeConversationGroupId = conversation.groupId || 'default';
      }
      else {
        this.system_prompt = " ";
        this.messages = [{ id: Date.now() + Math.random(), role: 'system', content: this.system_prompt }];
      }
      if(this.allBriefly){
        this.messages.forEach((m) => {
          m.briefly = true;
        })
      }else{
        this.messages.forEach((m) => {
          m.briefly = false;
        })
      }
      this.inAutoMode = false; // Reset automatic mode state
      this.requestScrollToBottom();
      this.sendMessagesToExtension(); // Send messages to extensions

      this.autoSaveSettings();
    },
    formatConversationTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      const now = new Date();
      if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
    },
    // Use lightweight substring extraction instead of expensive DOM and regex replacements
    getConversationPreview(conversation) {
      const messages = Array.isArray(conversation?.messages) ? conversation.messages :[];
      const firstUsefulMessage = messages.find(msg => msg && msg.role !== 'system' && msg.content);
      if (!firstUsefulMessage) return this.t('newChat');
      
      // Extract a substring or the plain text of the first sentence
      const rawContent = Array.isArray(firstUsefulMessage.content)
        ? firstUsefulMessage.content.map(item => item?.text || '').join(' ')
        : String(firstUsefulMessage.content);
        
      // Take the first 30 characters without global regex replacement
      return rawContent.substring(0, 30) + (rawContent.length > 30 ? '...' : '') || this.t('newChat');
    },
    async syncGroupMemoryAfterReply(userMessage, assistantMessage) {
      const groupId = this.activeConversationGroupId || this.draftConversationGroupId || 'default';
      if (!groupId || groupId === 'default') return;
      if (!userMessage?.id || !assistantMessage?.id) return;

      try {
        await fetch('/api/group-memory/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            group_id: this.stringifyEntityId(groupId),
            conversation_id: this.stringifyEntityId(this.conversationId),
            user_message_id: this.stringifyEntityId(userMessage.id),
            assistant_message_id: this.stringifyEntityId(assistantMessage.id),
            user_message: userMessage.pure_content ?? userMessage.content ?? '',
            assistant_message: assistantMessage.pure_content ?? assistantMessage.content ?? '',
          }),
        });
      } catch (error) {
        console.error('Failed to sync group memory:', error);
        showNotification(this.t('memorySyncFailed'), 'error');
      }
    },
    switchToagents() {
      this.activeMenu = 'api-group';
      this.subMenu = 'agents';
      this.activeAgentTab = 'add'
    },
    switchToa2aServers() {
      this.activeMenu = 'toolkit';
      this.subMenu = 'a2a';
    },
    switchToSystemPrompts() {
      this.showEditDialog = false;
      this.activeMenu = 'role';
      this.subMenu = 'memory';
      this.activeMemoryTab = 'prompts';
    },
    async syncProviderConfig(targetConfig) {
      if (targetConfig.selectedProvider) {
        const provider = this.modelProviders.find(
          p => p.id === targetConfig.selectedProvider && !p.disabled
        );
        if (provider) {
          let targetUrl = provider.url;

          // Check whether the synchronized object is ccSettings by reference
          // Use the special vendor_list mapping for CC configuration
          if (targetConfig === this.ccSettings) {
             const vendor_list = {
              "Anthropic": "https://api.anthropic.com/",
              "newapi": provider.url.replace(/\/v1\/?$/, ''),
              "Ollama":provider.url.replace(/\/v1\/?$/, '')
            };
            // Use mapped URL, falling back to the default
            targetUrl = vendor_list[provider.vendor] || provider.url;
          }

          // Synchronize core configuration using targetUrl for comparisons and assignment
          const shouldUpdate = 
            targetConfig.model !== provider.modelId ||
            targetConfig.base_url !== targetUrl || // Compare targetUrl
            targetConfig.api_key !== provider.apiKey;
            
          if (shouldUpdate) {
            targetConfig.model = provider.modelId || '';
            targetConfig.base_url = targetUrl || ''; // Assign targetUrl
            targetConfig.api_key = provider.apiKey || '';
            console.log("Synchronized " + provider.vendor + " configuration (CC mode: " + (targetConfig === this.ccSettings) + ")");
          }
        } else {
          // ... (retain existing cleanup logic)
          console.warn('No matching provider; configuration reset');
          targetConfig.selectedProvider = null;
          targetConfig.model = '';
          targetConfig.base_url = '';
          targetConfig.api_key = '';
        }
        await this.autoSaveSettings();
      }
    },
    updateMCPExample() {
      this.currentMCPExample = this.mcpExamples[this.newMCPType];
    },
    
    toggleMCPServer(name, status) {
      this.mcpServers[name].disabled = !status
      this.autoSaveSettings()
    },
    switchTomcpServers() {
      this.activeMenu = 'toolkit';
      this.subMenu = 'mcp'
    },
    // Window control
    minimizeWindow() {
      if (isElectron) window.electronAPI.windowAction('minimize');
    },
    maximizeWindow() {
      if (isElectron) window.electronAPI.windowAction('maximize');
    },
    closeWindow() {
      if (isElectron) window.electronAPI.windowAction('close');
    },
    async handleSelect(key) {
      if (key === 'model-config') {
        this.activeMenu = 'model-config';
        this.subMenu = 'service'; // Show the first submenu by default
      }
      else if (key === 'role') {
        this.activeMenu = 'role';
        this.subMenu = 'memory'; // Show the first submenu by default
      }
      else if (key === 'toolkit') {
        this.activeMenu = 'toolkit';
        this.subMenu = 'tools'; // Show the first submenu by default
      }
      else if (key === 'api-group') {
        this.activeMenu = 'api-group';
        this.subMenu = 'openai'; // Show the first submenu by default
      }
      else if (key === 'storage') {
        this.activeMenu = 'storage';
        this.subMenu = 'text'; // Show the first submenu by default
        response = await fetch(`/update_storage`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            }
        });
        if (response.ok) {
          console.log('Storage files updated successfully');
          data = await response.json();
          this.textFiles = data.textFiles;
          this.imageFiles = data.imageFiles;
          this.videoFiles = data.videoFiles;
          this.autoSaveSettings();
        }
        else {
          console.error('Failed to update storage files');
        }
      }
      else if (key === 'deploy-bot') {
        this.activeMenu = 'deploy-bot';
        this.subMenu = 'table_pet'; // Show the first submenu by default
      }
      else if (key === 'system') {
        this.activeMenu = 'system';
        this.subMenu = 'general'; // Show general settings by default
        this.loadAccountList(); // Load account list
      }
      else {
        this.activeMenu = key;
      }
      this.activeMenu = key;
    }, 
    toggleIcon() {
      this.isExpanded = !this.isExpanded; // Toggle on click
      this.maximizeWindow();
    },

    throttledUpdate(index, newContent) {
      this.messages[index].content = newContent;
      if (!this._pendingRenderContent) this._pendingRenderContent = {};
      this._pendingRenderContent[index] = newContent;

      if (this.renderTimers[index]) return;

      this.renderTimers[index] = setTimeout(() => {
        const latestContent = this._pendingRenderContent[index];
        if (latestContent !== undefined) {
          this.messages[index].renderedHtml = this.formatMessage(latestContent, index);
        }
        this.renderTimers[index] = null;
        this._pendingRenderContent[index] = undefined;
      }, 16);
    },


preprocessEntertainmentText(content) {
  if (!content) return '';

  let formatted = content;

  // ============================================================
  // Sanitize custom metadata and multilingual character tags (e.g. <user=...>, <Character>, </Character>)
  // ============================================================
  const preservedHtmlTags = '(?:div|span|p|br|a|img|strong|em|code|pre|ul|ol|li|h[1-6]|blockquote|table|thead|tbody|tr|th|td|iframe|video|audio|canvas|svg|path|section|button|i|details|summary|think)';
  
  // 1. Filter raw custom tags (e.g. <Character> or <user=Alex ...>)
  // Match only non-allowlisted valid tag names, not ordinary expressions such as a < b
  const customTagRegex = new RegExp(`<\\/?(?!(?:${preservedHtmlTags})\\b)[a-zA-Z0-9\\u4e00-\\u9fa5_-]+[^>]*>`, 'gi');
  formatted = formatted.replace(customTagRegex, '');

  // 2. Filter escaped custom tags or tags converted by LaTeX (e.g. \lt Character\gt)
  const escapedCustomTagRegex = new RegExp(`(?:&lt;|\\\\lt\\b|\\\\lt\\s+)(?:\\/)?(?!(?:${preservedHtmlTags})\\b)([a-zA-Z0-9\\u4e00-\\u9fa5_-]+)[^&\\\\\\n]*(?:&gt;|\\\\gt\\b)`, 'gi');
  formatted = formatted.replace(escapedCustomTagRegex, '');


  // ============================================================
  // 1. Isolate images in text, including silence wrappers and whitespace
  // Insert double line breaks around images regardless of existing line breaks
  // ============================================================
  formatted = formatted.replace(/(<silence>\s*)?(!\[.*?\]\([^\)]+\))(\s*<\/silence>)?/gi, '\n\n$1$2$3\n\n');

  // ============================================================
  // 2. Collapse redundant line breaks introduced by formatting or generated text
  // Ensure a single blank line between Markdown elements
  // ============================================================
  formatted = formatted.replace(/\n{3,}/g, '\n\n');

  // ============================================================
  // 3. Remove <silence> and </silence> from the rendered UI
  // Prevent these tags from appearing as text or unknown HTML in the bubble
  // ============================================================
  formatted = formatted.replace(/<\/?silence>/gi, '');

  // ============================================================
  // 4. Smart line breaks in entertainment mode: preserve tables, lists, headings and Markdown structure
  // ============================================================
  if (this.systemSettings && this.systemSettings.chatMode === 'entertainment') {
    const lines = formatted.split('\n');
    const processedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i].trim();
      const nextLine = (lines[i + 1] || '').trim();

      processedLines.push(lines[i]);

      if (i < lines.length - 1) {
        // Check whether this is a table row
        const isCurrentTable = currentLine.includes('|');
        const isNextTable = nextLine.includes('|');

        // Check for unordered lists, ordered lists or blockquotes
        const structurePattern = /^([-*+>]|\d+\.)\s/;
        const isCurrentStructure = structurePattern.test(currentLine);
        const isNextStructure = structurePattern.test(nextLine);

        // Check for Markdown headings
        const headingPattern = /^#{1,6}\s/;
        const isCurrentHeading = headingPattern.test(currentLine);
        const isNextHeading = headingPattern.test(nextLine);

        // Check whether the current or next line is blank
        const isCurrentEmpty = currentLine === '';
        const isNextEmpty = nextLine === '';

        if (!isCurrentTable && !isNextTable && 
            !isCurrentStructure && !isNextStructure && 
            !isCurrentHeading && !isNextHeading &&
            !isCurrentEmpty && !isNextEmpty) {
          processedLines.push('');
        }
      }
    }
    formatted = processedLines.join('\n');
  }

  return formatted;
},

formatMessage(content, index) {
  if (!content) return '';

  // ============================================================
  // Sanitize custom metadata and multilingual character tags (e.g. <user=...>, <Character>, </Character>)
  // Remove early so LaTeX protection does not convert tags into \lt characters
  // ============================================================
  let processedForRender = content;
  
  const preservedHtmlTags = '(?:div|span|p|br|a|img|strong|em|code|pre|ul|ol|li|h[1-6]|blockquote|table|thead|tbody|tr|th|td|iframe|video|audio|canvas|svg|path|section|button|i|details|summary|think)';
  
  // 1. Filter raw custom tags (e.g. <Character> or <user=Alex ...>)
  const customTagRegex = new RegExp(`<\\/?(?!(?:${preservedHtmlTags})\\b)[a-zA-Z0-9\\u4e00-\\u9fa5_-]+[^>]*>`, 'gi');
  processedForRender = processedForRender.replace(customTagRegex, '');

  // 2. Filter escaped custom tags or tags converted by LaTeX (e.g. \lt Character\gt)
  const escapedCustomTagRegex = new RegExp(`(?:&lt;|\\\\lt\\b|\\\\lt\\s+)(?:\\/)?(?!(?:${preservedHtmlTags})\\b)([a-zA-Z0-9\\u4e00-\\u9fa5_-]+)[^&\\\\\\n]*(?:&gt;|\\\\gt\\b)`, 'gi');
  processedForRender = processedForRender.replace(escapedCustomTagRegex, '');

  processedForRender = processedForRender.trimEnd(); 
  
  const lines = processedForRender.split('\n');
  const lastLine = lines[lines.length - 1].trim();

  if (lastLine.startsWith('|') && !lastLine.endsWith('|') && !/^[|\s-:]+$/.test(lastLine)) {
    processedForRender += ' |';
  }

  // --- Preprocessing ---
  const parts = this.splitCodeAndText(processedForRender);
  let inUnclosedCodeBlock = false;

  let processedContent = parts.map(part => {
    if (part.type === 'code') {
      inUnclosedCodeBlock = !part.closed;
      return part.content; 
    } else if (inUnclosedCodeBlock) {
      return part.content; 
    } else {
      let formatted = part.content;

      // ============================================================
      // Entertainment mode: convert appropriate single line breaks into double line breaks
      // Preserve tables, lists, headings and blockquotes
      // ============================================================
      if (this.systemSettings && this.systemSettings.chatMode === 'entertainment') {
        const linesList = formatted.split('\n');
        const processedLines = [];
        
        for (let i = 0; i < linesList.length; i++) {
          const currentLine = linesList[i].trim();
          const nextLine = (linesList[i + 1] || '').trim();

          processedLines.push(linesList[i]);

          if (i < linesList.length - 1) {
            // 1. Check for table rows containing pipes
            const isCurrentTable = currentLine.includes('|');
            const isNextTable = nextLine.includes('|');

            // 2. Check for unordered lists, ordered lists or blockquotes
            const structurePattern = /^([-*+>]|\d+\.)\s/;
            const isCurrentStructure = structurePattern.test(currentLine);
            const isNextStructure = structurePattern.test(nextLine);

            // 3. Check for Markdown headings
            const headingPattern = /^#{1,6}\s/;
            const isCurrentHeading = headingPattern.test(currentLine);
            const isNextHeading = headingPattern.test(nextLine);

            // 4. Check current or next line for blanks to avoid extra whitespace
            const isCurrentEmpty = currentLine === '';
            const isNextEmpty = nextLine === '';

            // Double line breaks only when neither line is a structured Markdown element
            if (!isCurrentTable && !isNextTable && 
                !isCurrentStructure && !isNextStructure && 
                !isCurrentHeading && !isNextHeading &&
                !isCurrentEmpty && !isNextEmpty) {
              processedLines.push('');
            }
          }
        }
        formatted = processedLines.join('\n');
      }

      // ============================================================
      // Force images onto separate paragraphs
      // Insert double line breaks around images, including those wrapped in silence tags
      // ============================================================
      formatted = formatted.replace(/(<silence>)?(!\[.*?\]\([^\)]+\))(<\/silence>)?/g, '\n\n$1$2$3\n\n');

      // Collapse redundant consecutive line breaks to maintain compact Markdown
      formatted = formatted.replace(/\n{3,}/g, '\n\n');

      // ============================================================
      // UI filter: remove <silence> and </silence>
      // This regex runs only in formatMessage and does not affect
      // the underlying TTS engine, which reads raw content or pure_content.
      // ============================================================
      formatted = formatted.replace(/<\/?silence>/gi, '');

      // ============================================================
      // LaTeX formula protection
      // Protect < and > inside formulas from HTML tag filtering
      // ============================================================
      formatted = formatted.replace(/\$\$([\s\S]*?)(?:\$\$|$)|\$([^\$\n]+)\$/g, function(match) {
        return match.replace(/</g, '\\lt ').replace(/>/g, '\\gt ');
      });

      // ============================================================
      // Smart tag filtering
      // ============================================================
      const anyTagRegex = /<(\/?)([^\s>/>]+)([^>]*)>/g;
      formatted = formatted.replace(anyTagRegex, (match, slash, tagName, attrs) => {
        const lowerTagName = tagName.toLowerCase();
        if (lowerTagName === 'think') return match;
        const isStandardHtmlName = /^[a-zA-Z][a-zA-Z0-9-]*$/.test(tagName);
        if (isStandardHtmlName) {
          const safeAttrs = attrs.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
          return `<${slash}${tagName}${safeAttrs}>`;
        } else {
          return '';
        }
      });

      // ============================================================
      // Hold incomplete trailing tags when streaming stops mid-tag (e.g. "<mouth_smile:0.").
      // The regex cannot match without a closing >; defer the fragment until complete.
      // ============================================================
      formatted = this.holdbackUnclosedTrailingTag(formatted);

      // ============================================================
      // Convert <think> tags for UI rendering
      // ============================================================
      const thinkTagRegexWithClose = /<think>([\s\S]*?)<\/think>/g;
      const thinkTagRegexOpenOnly = /<think>[\s\S]*$/;
      
      formatted = formatted
        .replace(thinkTagRegexWithClose, match => 
          match.replace('<think>', '<div class="highlight-block-reasoning">').replace('</think>', '</div>')
        )
        .replace(thinkTagRegexOpenOnly, match => 
          match.replace('<think>', '<div class="highlight-block-reasoning">')
        );

      return formatted;
    }
  }).join('');

  let rendered = md.render(processedContent);

  // --- Restoration ---
  rendered = rendered.replace(/\\\`/g, '`').replace(/\\\$/g, '$');

  // Check that currentMsg exists
  const currentMsg = this.messages && index >= 0 ? this.messages[index] : null;
  if (currentMsg && index === this.messages.length - 1 && currentMsg.role === 'assistant' && this.isTyping && currentMsg.content !== currentMsg.pure_content) {
    rendered = `<div class="thinking-header"><i class="fa-solid fa-lightbulb"></i> ${this.t('thinking')}</div>` + rendered;
  }

  // --- Postprocessing ---
  this.$nextTick(() => {
    if(typeof this.initCopyButtons === 'function') this.initCopyButtons();
    if(typeof this.initPreviewButtons === 'function') this.initPreviewButtons();
  });

  rendered = rendered.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>/g, (match, href, otherAttrs) => {
    if (otherAttrs.includes('footnote-ref') || otherAttrs.includes('footnote-backref') || href.startsWith('#')) {
      return match; 
    }
    const formattedHref = typeof this.formatFileUrl === 'function' ? this.formatFileUrl(href) : href;
    return `<a href="${formattedHref}" target="_blank"${otherAttrs}>`;
  });

  return rendered;
},

    formatMessageWrapper(content) {
        // Call formatMessage with index = -1 to avoid side effects such as thinking icons
        return this.formatMessage(content, -1); 
    },
    copyLink(uniqueFilename) {
      const url = `${this.partyURL}/uploaded_files/${uniqueFilename}`
      navigator.clipboard.writeText(url)
        .then(() => {
          showNotification(this.t('copy_success'))
        })
        .catch(() => {
          showNotification(this.t('copy_failed'), 'error')
        })
    },
    copyApiKey(apiKey){
      navigator.clipboard.writeText(apiKey)
        .then(() => {
          showNotification(this.t('copy_success'))
        })
        .catch(() => {
          showNotification(this.t('copy_failed'), 'error')
        })
    },
    copyProvider(provider,index){
      // Insert a copy after the selected modelProviders index
      this.modelProviders.splice(index + 1, 0, { ...provider, id: Date.now() });
      this.autoSaveSettings();
    },
    previewImage(img) {
      this.previewImageUrl = `${this.partyURL}/uploaded_files/${img.unique_filename}`
      this.previewVisible = true
      console.log(this.previewImageUrl)
    },
    copyMessageContent(message) {
      // Copy original user content or original assistant Markdown
      let content = message.role === 'user' 
        ? message.content 
        : message.pure_content || message.rawContent || message.content;
      // Handle file links
      if (message.fileLinks?.length) {
        content += '\n\n' + message.fileLinks.map(link => `[${link.name}](${link.path})`).join('\n');
      }
      navigator.clipboard.writeText(content)
        .then(() => showNotification(this.t('copy_success')))
        .catch(() => showNotification(this.t('copy_failed'), 'error'));
    },
    initPreviewButtons() {
      // Remove old event listeners
      if (this._previewEventHandler) {
        document.body.removeEventListener('click', this._previewEventHandler);
      }
      // Main event handler
      this._previewEventHandler = (e) => {
        const button = e.target.closest('.preview-button');
        if (!button) return;
        e.preventDefault();
        e.stopPropagation();
        console.debug('Preview button triggered:', button);
        // Get code context
        const codeBlock = button.closest('.code-block');
        if (!codeBlock) {
          console.error('Code block container not found');
          return;
        }
        // Get code content
        const lang = button.dataset.lang;
        const codeContent = codeBlock.querySelector('code')?.textContent?.trim();
        if (!codeContent) {
          console.warn('Empty code content', codeBlock);
          this.showErrorToast('Code is empty');
          return;
        }
        // Find or create preview container inside codeBlock
        let previewContainer = codeBlock.querySelector('.preview-container');
        const isNewContainer = !previewContainer;
        
        if (isNewContainer) {
          previewContainer = document.createElement('div');
          previewContainer.className = 'preview-container loading';
          codeBlock.appendChild(previewContainer);
        }
        // Toggle state
        if (previewContainer.classList.contains('active')) {
          this.collapsePreview(previewContainer, button);
        } else {
          this.expandPreview({ previewContainer, button, lang, codeContent });
        }
      };
      // Bind event listener
      document.body.addEventListener('click', this._previewEventHandler);
      // console.log('Preview button listener initialized');
    },
    // Expand preview panel
    expandPreview({ previewContainer, button, lang, codeContent }) {
      console.log('Expand preview:', { lang, length: codeContent.length });
      
      const codeBlock = button.closest('.code-block');
  
      // Check for existing preview
      const existingPreview = codeBlock.querySelector('.preview-container.active');
      if (existingPreview) {
        this.collapsePreview(existingPreview, button);
        return;
      }
      // Mark code block state
      codeBlock.dataset.previewActive = "true";
      
      // Hide code content
      const codeContentDiv = codeBlock.querySelector('.code-content');
      codeContentDiv.style.display = 'none';
      
      // Update button state
      button.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
      
      previewContainer.classList.add('active', 'loading');
      if (lang === 'mermaid'){
        previewContainer.style.width =  '85vw';
      }
      
      // Render content
      requestAnimationFrame(() => {
        try {
          if (lang === 'html') {
            this.renderHtmlPreview(previewContainer, codeContent);
            // Dynamically resize iframe height
            const iframe = previewContainer.querySelector('iframe');
            iframe.onload = () => {
              iframe.style.height = iframe.contentWindow.document.body.scrollHeight + 'px';
            };
          } else if (lang === 'mermaid') {
            this.renderMermaidPreview(previewContainer, codeContent).then(() => {
              // Resize after Mermaid rendering completes
              const svg = previewContainer.querySelector('svg');
              if (svg) {
                previewContainer.style.minHeight = svg.getBBox().height + 'px';
              }
            });
          }
          previewContainer.classList.remove('loading');
        } catch (err) {
          console.error('Preview rendering failed:', err);
          this.showPreviewError(previewContainer, err);
        }
      });
    },
    // collapsePreview method
    collapsePreview(previewContainer, button) {
      console.log('Collapse preview');
      
      const codeBlock = previewContainer.parentElement;
  
      // Reset code block state
      delete codeBlock.dataset.previewActive;
      
      // Show code content
      const codeContentDiv = codeBlock.querySelector('.code-content');
      codeContentDiv.style.display = 'block';
      
      // Remove preview container
      previewContainer.remove();
      
      // Reset button state
      button.innerHTML = '<i class="fa-solid fa-eye"></i>';
    },
    // HTML renderer
    renderHtmlPreview(container, code) {
      console.log('Render HTML preview');
      
      const sandbox = document.createElement('iframe');
      sandbox.srcdoc = `<!DOCTYPE html>
        <html>
          <head>
            <base href="/">
          </head>
          <body>${code}</body>
        </html>`;
      
      sandbox.style.cssText = `
        width: 70vw;
        height: 70vh;
        border: none;
        border-radius: 8px;
        background: transparent;
      `;
      
      container.replaceChildren(sandbox);
    },
    // Mermaid renderer with retry support
    async renderMermaidPreview(container, code) {
      console.log('Render Mermaid diagram');
      
      const diagramContainer = document.createElement('div');
      diagramContainer.className = 'mermaid-diagram';
      container.replaceChildren(diagramContainer);
      // Asynchronous rendering
      let retryCount = 0;
      const maxRetries = 3;
      
      const attemptRender = async () => {
        try {
          diagramContainer.textContent = code;
          await mermaid.run({
            nodes: [diagramContainer],
            suppressErrors: false
          });
          console.log('Mermaid rendering succeeded');
        } catch (err) {
          if (retryCount < maxRetries) {
            retryCount++;
            console.warn("Retry rendering (" + retryCount + "/" + maxRetries + ")");
            diagramContainer.innerHTML = '';
            await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
            await attemptRender();
          } else {
            throw new Error(`Mermaid rendering failed: ${err.message}`);
          }
        }
      };
      await attemptRender();
    },
    // Error handling
    showPreviewError(container, error) {
      container.classList.add('error');
      container.innerHTML = `
        <div class="error-alert">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <div>
            <h4>Preview rendering failed</h4>
            <code>${error.message}</code>
          </div>
        </div>
      `;
    },
    // Detect unclosed code blocks
    hasUnclosedCodeBlock(parts) {
      return parts.some(p => p.type === 'code' && !p.closed);
    },

    /**
     * Hold incomplete trailing tags during streaming, e.g. "<mouth_smile:0."
     * Smart filtering (anyTagRegex) matches only tags with a closing >.
     * If a stream increment ends mid-tag, the fragment would otherwise appear in the bubble.
     * Like the TTS stream buffer, defer the incomplete fragment this frame,
     * then filter it once a later increment supplies the closing >.
     * Use the same tag-name regex as smart filtering: retain standard HTML names,
     * and defer nonstandard names such as expression and motion tags.
     * @param {string} text Complete accumulated text for the current frame
     * @returns {string} Text with the incomplete trailing tag withheld
     */
    holdbackUnclosedTrailingTag(text) {
      const lt = text.lastIndexOf('<');
      if (lt === -1) return text;
      const fragment = text.slice(lt + 1);
      // A closing > means the trailing tag is complete; let smart filtering handle it
      if (fragment.includes('>')) return text;
      const tagName = fragment.split(/\s/)[0].replace(/^\//, '');
      // Retain standard HTML names or an ambiguous standalone < until more text arrives
      if (tagName === '' || /^[a-zA-Z][a-zA-Z0-9-]*$/.test(tagName)) return text;
      // Defer nonstandard tag fragments and render again with the next increment
      return text.slice(0, lt);
    },

    splitCodeAndText(content) {
      const codeFenceRegex = /(```[\s\S]*?)(?:```|$)/g; // Code-fence matching regex
      const parts = [];
      let lastIndex = 0;
      let hasUnclosed = false;

      // Process code block
      let match;
      while ((match = codeFenceRegex.exec(content)) !== null) {
        const textBefore = content.slice(lastIndex, match.index);
        if (textBefore) parts.push({ type: 'text', content: textBefore });

        // Check whether the fence is closed
        const isClosed = match[0].endsWith('```');
        const codeContent = isClosed ? 
          match[0] : 
          match[0] + '\n```'; // Complete the closing fence

        parts.push({
          type: 'code',
          content: codeContent,
          closed: isClosed
        });

        lastIndex = codeFenceRegex.lastIndex;
        hasUnclosed = !isClosed;
      }

      // Process remaining content
      const remaining = content.slice(lastIndex);
      if (remaining) {
        if (hasUnclosed) {
          // Treat remaining content as a code block
          parts.push({
            type: 'code',
            content: remaining + '\n```',
            closed: false
          });
        } else {
          parts.push({ type: 'text', content: remaining });
        }
      }

      return parts;
    },
    initDownloadButtons() {
        document.body.addEventListener('click', async (e) => {
            const button = e.target.closest('.download-button');
            if (!button) return;
            const lang = button.dataset.lang;
            const codeBlock = button.closest('.code-block');
            const previewButton = codeBlock.querySelector('.preview-button');
            const existingPreview = codeBlock.querySelector('.preview-container.active');
            // If previewButton is not already active, open the preview
            if (!existingPreview) {
                // Trigger the preview button click
                previewButton.click();
                // Wait for preview to finish
                await new Promise(resolve => setTimeout(resolve, 500)); // Adjust delay as needed
            }
            const previewContainer = codeBlock.querySelector('.preview-container');
            try {
                if (lang === 'mermaid') {
                    // Capture with html2canvas
                    html2canvas(previewContainer, {
                        // A scrollable Mermaid diagram may need explicit width and height
                        width: previewContainer.offsetWidth,
                        height: previewContainer.offsetHeight,
                    }).then(canvas => {
                        canvas.toBlob(blob => {
                            this.triggerDownload(blob, 'mermaid-diagram.png');
                        });
                    }).catch(error => {
                        console.error('Screenshot failed:', error);
                        showNotification('Screenshot failed. Check the console.', 'error');
                    });
                }
                else if (lang === 'html') {
                    const iframe = previewContainer.querySelector('iframe');
                    const canvas = await html2canvas(iframe.contentDocument.body);
                    canvas.toBlob(blob => {
                        this.triggerDownload(blob, 'html-preview.png');
                    });
                }
            } catch (error) {
                console.error('Download failed:', error);
                showNotification('Download failed. Check the console.', 'error');
            }
        });
    },

    triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },
    
    handleCopy(event) {
      const button = event.target.closest('.copy-button')
      if (button) {
        const codeBlock = button.closest('.code-block')
        const codeContent = codeBlock?.querySelector('code')?.textContent || ''
        
        navigator.clipboard.writeText(codeContent).then(() => {
          showNotification(this.t('copy_success'))
        }).catch(() => {
          showNotification(this.t('copy_failed'), 'error')
        })
        
        event.stopPropagation()
        event.preventDefault()
      }
    },
    
    initCopyButtons() {
      // Remove previous ClipboardJS initialization
      document.querySelectorAll('.copy-button').forEach(btn => {
        btn.removeEventListener('click', this.handleCopy)
        btn.addEventListener('click', this.handleCopy)
      })
    },  
    // Scroll to latest message
    /* Check whether an element is near the bottom */
    isElemNearBottom(el, threshold = 300) {
      if (!el) return true;               // If absent, assume scrolling to bottom is needed
      return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    },

      /* ==========================================
       Optimized scroll handling, including nested scrollable blocks
       ========================================== */
    scrollToBottom() {
      this.$nextTick(() => {
        const container = this.$refs.messagesContainer;
        if (container) {
          // 1. Scroll the outer main container
          if (this.isElemNearBottom(container) || this.isForceScrollToBottom) {
            container.scrollTop = container.scrollHeight;
          }
          
          // 2. Scroll inner blocks with scrollbars (tool code and reasoning)
          const innerBlocks = container.querySelectorAll('.sp-code, .type-reasoning .sp-content');
          innerBlocks.forEach(block => {
            if (block.scrollHeight > block.clientHeight) {
              // Reuse isElemNearBottom and follow the bottom unless the user scrolled up
              if (this.isElemNearBottom(block) || this.isForceScrollToBottom) {
                block.scrollTop = block.scrollHeight;
              }
            }
          });
        }
      });
      
      this.scrollPanelToBottom();
      // Retain compatibility with existing behavior
      if (typeof isElectron !== 'undefined' ? isElectron : this.isElectron) {
        this.browserPanelToBottom();
      }
    },

    /* Sidebar scrolling */
    scrollPanelToBottom() {
      this.$nextTick(() => {
        const panel = this.$refs.messagesPanel;
        if (panel) {
          // 1. Scroll the outer sidebar container
          if (this.isElemNearBottom(panel) || this.isForceScrollToBottom) {
            panel.scrollTop = panel.scrollHeight;
          }

          // 2. Scroll inner sidebar blocks
          const innerBlocks = panel.querySelectorAll('.sp-code, .type-reasoning .sp-content');
          innerBlocks.forEach(block => {
            if (block.scrollHeight > block.clientHeight) {
              if (this.isElemNearBottom(block) || this.isForceScrollToBottom) {
                block.scrollTop = block.scrollHeight;
              }
            }
          });
        }
      });
    },

    /* Independent browser panel scrolling */
    browserPanelToBottom() {
      this.$nextTick(() => {
        const panel = this.$refs.browserMessagesContainer;
        if (panel) {
          // 1. Scroll outer browser panel
          if (this.isElemNearBottom(panel) || this.isForceScrollToBottom) {
            panel.scrollTop = panel.scrollHeight;
          }

          // 2. Scroll inner browser panel blocks
          const innerBlocks = panel.querySelectorAll('.sp-code, .type-reasoning .sp-content');
          innerBlocks.forEach(block => {
            if (block.scrollHeight > block.clientHeight) {
              if (this.isElemNearBottom(block) || this.isForceScrollToBottom) {
                block.scrollTop = block.scrollHeight;
              }
            }
          });
        }
      });
    },
    changeMainAgent(agent) {
      this.mainAgent = agent;
      if (agent === 'super-model') {
        this.system_prompt = " "
      }
      else {
        this.system_prompt = this.agents[agent].system_prompt;
        console.log(this.system_prompt);
      }
      this.syncSystemPromptToMessages(this.system_prompt);
    },

    // WebSocket handling
    initWebSocket() {
      const http_protocol = window.location.protocol;
      const ws_protocol = http_protocol === 'https:' ? 'wss:' : 'ws:';
      const ws_url = `${ws_protocol}//${window.location.host}/ws`;

      this.ws = new WebSocket(ws_url);

      // Heartbeat and reconnect intervals in milliseconds
      const HEARTBEAT_INTERVAL = 10000; // Send ping every ten seconds
      const RECONNECT_INTERVAL = 5000;  // Retry every five seconds after disconnect

      let heartbeatTimer = null;
      let reconnectTimer = null;

      const startHeartbeat = () => {
        heartbeatTimer = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
              this.ws.send(JSON.stringify({ type: 'ping' })); // Send heartbeat
            } catch (e) {
              console.error('Failed to send ping:', e);
            }
          }
        }, HEARTBEAT_INTERVAL);
      };

      const stopHeartbeat = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      };

      const scheduleReconnect = () => {
        stopHeartbeat();
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            console.log('Reconnecting WebSocket...');
            this.initWebSocket(); // Reinitialize
            reconnectTimer = null;
          }, RECONNECT_INTERVAL);
        }
      };

      // WebSocket open event
      this.ws.onopen = () => {
        console.log('WebSocket connection established');
        stopHeartbeat(); // Prevent duplicate heartbeats
        startHeartbeat();
      };

      // Receive message
      this.ws.onmessage = async (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch (e) {
          console.log('Message from server:', event.data);
          return;
        }

      if (data.type === 'pong') {
        // Optionally handle pong responses
        console.log('Received pong from server.');
      } 
      else if (data.type === 'behavior') {
          this.behaviorSettings = data.data.behaviorSettings || this.behaviorSettings;
          this.autoSaveSettings();
      }
      else if (data.type === 'settings_update') {
          this.settings = {
            model: data.data.model || '',
            base_url: data.data.base_url || '',
            api_key: data.data.api_key || '',
            temperature: data.data.temperature || 0.7,
            max_tokens: data.data.max_tokens || 4096,
            max_rounds: data.data.max_rounds || 0,
            selectedProvider: data.data.selectedProvider || '',
            top_p: data.data.top_p || 1,
            reasoning_effort: data.data.reasoning_effort || null,
            enableOmniTTS: data.data.enableOmniTTS || false,
            omniVoice: data.data.omniVoice || 'Cherry',
            extra_params: data.data.extra_params || [],
          };
          this.discordBotConfig = data.data.discordBotConfig || this.discordBotConfig;
          this.telegramBotConfig = data.data.telegramBotConfig || this.telegramBotConfig;
          this.slackBotConfig = data.data.slackBotConfig || this.slackBotConfig;
          this.targetLangSelected = data.data.targetLangSelected || this.targetLangSelected;
          this.BotConfig = data.data.BotConfig || this.BotConfig;
          this.liveConfig = data.data.liveConfig || this.liveConfig;
          this.stickerPacks = data.data.stickerPacks || this.stickerPacks;
          this.toolsSettings = data.data.tools || this.toolsSettings;
          this.llmTools = data.data.llmTools || this.llmTools;
          this.reasonerSettings = data.data.reasoner || this.reasonerSettings;
          this.fastSettings = data.data.fast || this.fastSettings;
          this.visionSettings = data.data.vision || this.visionSettings;
          this.webSearchSettings = data.data.webSearch || this.webSearchSettings;
          this.codeSettings = data.data.codeSettings || this.codeSettings;
          this.CLISettings = data.data.CLISettings || this.CLISettings;
          this.acpSettings = data.data.acpSettings || this.acpSettings;
          this.wslSettings = data.data.wslSettings || this.wslSettings;
          this.visionControlSettings = data.data.visionControlSettings || this.visionControlSettings;
          this.loveSettings = data.data.loveSettings || this.loveSettings;
          this.diarySettings = data.data.diarySettings || this.diarySettings;
          this.ccSettings = data.data.ccSettings || this.ccSettings;
          this.qcSettings = data.data.qcSettings || this.qcSettings;
          this.dsSettings = data.data.dsSettings || this.dsSettings;
          this.localEnvSettings = data.data.localEnvSettings || this.localEnvSettings;
          this.ocSettings = data.data.ocSettings || this.ocSettings;
          this.HASettings = data.data.HASettings || this.HASettings;
          this.chromeMCPSettings = data.data.chromeMCPSettings || this.chromeMCPSettings;
          if (data.data.localAppControlSettings) Object.assign(this.localAppControlSettings, data.data.localAppControlSettings);
          this.sqlSettings = data.data.sqlSettings || this.sqlSettings;
          this.KBSettings = data.data.KBSettings || this.KBSettings;
          this.mcpServers = data.data.mcpServers || this.mcpServers;
          this.a2aServers = data.data.a2aServers || this.a2aServers;
          this.memories = data.data.memories || this.memories;
          this.memorySettings = data.data.memorySettings || this.memorySettings;
          this.text2imgSettings = data.data.text2imgSettings || this.text2imgSettings;
          this.ttsSettings = data.data.ttsSettings || this.ttsSettings;
          if (isSteamBuild) {
            if (this.ttsSettings.engine === 'edgetts') this.ttsSettings.engine = 'systemtts';
            if (this.text2imgSettings.engine === 'pollinations') this.text2imgSettings.engine = 'openai';
            this.systemSettings.contentSafety = true;
          }
          this.behaviorSettings = data.data.behaviorSettings || this.behaviorSettings;
          this.VRMConfig = data.data.VRMConfig || this.VRMConfig;
          this.THAConfig = data.data.THAConfig || this.THAConfig;
          this.SoulxConfig = data.data.SoulxConfig || this.SoulxConfig;
          this.comfyuiServers = data.data.comfyuiServers || this.comfyuiServers;
          this.comfyuiAPIkey = data.data.comfyuiAPIkey || this.comfyuiAPIkey;
          this.workflows = data.data.workflows || this.workflows;
          this.customHttpTools = data.data.custom_http || this.customHttpTools;
          this.systemSettings = data.data.systemSettings || this.systemSettings;
          if (isSteamBuild && !this.systemSettings.contentSafety) this.systemSettings.contentSafety = true;
      }
      else if (data.type === 'settings') {
          this.ensureConversationGroups();
          this.isdocker = data.data.isdocker || false;
          this.settings = {
            model: data.data.model || '',
            base_url: data.data.base_url || '',
            api_key: data.data.api_key || '',
            temperature: data.data.temperature || 0.7,
            max_tokens: data.data.max_tokens || 4096,
            max_rounds: data.data.max_rounds || 0,
            selectedProvider: data.data.selectedProvider || '',
            top_p: data.data.top_p || 1,
            reasoning_effort: data.data.reasoning_effort || null,
            enableOmniTTS: data.data.enableOmniTTS || false,
            omniVoice: data.data.omniVoice || 'Cherry',
            extra_params: data.data.extra_params || [],
          };
          this.isBtnCollapse = data.data.isBtnCollapse || false;
          this.showHistorySidebar = data.data.showHistorySidebar || false;
          this.system_prompt = data.data.system_prompt || '';
          this.SystemPromptsList = data.data.SystemPromptsList || [];
          this.conversations = data.data.conversations || this.conversations;
          this.conversationGroups = data.data.conversationGroups || this.conversationGroups;
          this.conversationId = data.data.conversationId || this.conversationId;
          this.agents = data.data.agents || this.agents;
          this.mainAgent = data.data.mainAgent || this.mainAgent;
          this.discordBotConfig = data.data.discordBotConfig || this.discordBotConfig;
          this.telegramBotConfig = data.data.telegramBotConfig || this.telegramBotConfig;
          this.slackBotConfig = data.data.slackBotConfig || this.slackBotConfig;
          this.targetLangSelected = data.data.targetLangSelected || this.targetLangSelected;
          this.allBriefly = data.data.allBriefly || this.allBriefly;
          this.isForceScrollToBottom = data.data.isForceScrollToBottom || this.isForceScrollToBottom;
          this.BotConfig = data.data.BotConfig || this.BotConfig;
          this.liveConfig = data.data.liveConfig || this.liveConfig;
          this.stickerPacks = data.data.stickerPacks || this.stickerPacks;
          this.toolsSettings = data.data.tools || this.toolsSettings;
          this.llmTools = data.data.llmTools || this.llmTools;
          this.reasonerSettings = data.data.reasoner || this.reasonerSettings;
          this.fastSettings = data.data.fast || this.fastSettings;
          this.visionSettings = data.data.vision || this.visionSettings;
          this.webSearchSettings = data.data.webSearch || this.webSearchSettings;
          this.codeSettings = data.data.codeSettings || this.codeSettings;
          this.CLISettings = data.data.CLISettings || this.CLISettings;
          this.acpSettings = data.data.acpSettings || this.acpSettings;
          this.wslSettings = data.data.wslSettings || this.wslSettings;
          this.visionControlSettings = data.data.visionControlSettings || this.visionControlSettings;
          this.loveSettings = data.data.loveSettings || this.loveSettings;
          this.diarySettings = data.data.diarySettings || this.diarySettings;
          this.ccSettings = data.data.ccSettings || this.ccSettings;
          this.qcSettings = data.data.qcSettings || this.qcSettings;
          this.dsSettings = data.data.dsSettings || this.dsSettings;
          this.localEnvSettings = data.data.localEnvSettings || this.localEnvSettings;
          this.ocSettings = data.data.ocSettings || this.ocSettings;
          this.HASettings = data.data.HASettings || this.HASettings;
          this.chromeMCPSettings = data.data.chromeMCPSettings || this.chromeMCPSettings;
          if (data.data.localAppControlSettings) Object.assign(this.localAppControlSettings, data.data.localAppControlSettings);
          this.sqlSettings = data.data.sqlSettings || this.sqlSettings;
          this.KBSettings = data.data.KBSettings || this.KBSettings;
          this.textFiles = data.data.textFiles || this.textFiles;
          this.imageFiles = data.data.imageFiles || this.imageFiles;
          this.videoFiles = data.data.videoFiles || this.videoFiles;
          this.knowledgeBases = data.data.knowledgeBases || this.knowledgeBases;
          this.modelProviders = data.data.modelProviders || this.modelProviders;
          this.systemSettings = data.data.systemSettings || this.systemSettings;
          if (isSteamBuild && !this.systemSettings.contentSafety) this.systemSettings.contentSafety = true;
          if (this.systemSettings && (this.systemSettings.autoCollapseInput === undefined || this.systemSettings.autoCollapseInput === null)) {
            this.systemSettings.autoCollapseInput = false;
          }
          if (isSteamBuild || (this.systemSettings.showDisclaimer !== false && !this.systemSettings.disclaimerAccepted)) {
            this.showDisclaimerDialog = true;
          }
          if (this.systemSettings && (this.systemSettings.codeFontScale === undefined || this.systemSettings.codeFontScale === null)) {
            this.systemSettings.codeFontScale = 1;
          }
          if (this.systemSettings && (this.systemSettings.autoCollapseInput === undefined || this.systemSettings.autoCollapseInput === null)) {
            this.systemSettings.autoCollapseInput = false;
          }
          this.showBrowserChat = data.data.showBrowserChat || this.showBrowserChat;
          this.searchEngine = data.data.searchEngine || this.searchEngine;
          if (data.data.largeMoreButtonDict) {
            this.largeMoreButtonDict = this.largeMoreButtonDict.map(existingButton => {
              const newButton = data.data.largeMoreButtonDict.find(button => button.name === existingButton.name);
              if (newButton) {
                return { ...existingButton, enabled: newButton.enabled };
              }
              return existingButton;
            });
          }
          if (data.data.smallMoreButtonDict) {
            this.smallMoreButtonDict = this.smallMoreButtonDict.map(existingButton => {
              const newButton = data.data.smallMoreButtonDict.find(button => button.name === existingButton.name);
              if (newButton) {
                return { ...existingButton, enabled: newButton.enabled };
              }
              return existingButton;
            });
          }
          this.loadConversation(this.conversationId);
          this.currentLanguage = 'en-US'; // Ignore legacy non-English UI settings.
          this.mcpServers = data.data.mcpServers || this.mcpServers;
          this.a2aServers = data.data.a2aServers || this.a2aServers;
          this.memories = data.data.memories || this.memories;
          this.memorySettings = data.data.memorySettings || this.memorySettings;
          this.text2imgSettings = data.data.text2imgSettings || this.text2imgSettings;
          this.asrSettings = data.data.asrSettings || this.asrSettings;
          this.ttsSettings = data.data.ttsSettings || this.ttsSettings;
          if (isSteamBuild && this.ttsSettings.engine === 'edgetts') this.ttsSettings.engine = 'systemtts';
          this.behaviorSettings = data.data.behaviorSettings || this.behaviorSettings;
          this.diarySettings = data.data.diarySettings || this.diarySettings;
          this.VRMConfig = data.data.VRMConfig || this.VRMConfig;
          this.THAConfig = data.data.THAConfig || this.THAConfig;
          this.SoulxConfig = data.data.SoulxConfig || this.SoulxConfig;
          this.comfyuiServers = data.data.comfyuiServers || this.comfyuiServers;
          this.comfyuiAPIkey = data.data.comfyuiAPIkey || this.comfyuiAPIkey;
          this.workflows = data.data.workflows || this.workflows;
          this.customHttpTools = data.data.custom_http || this.customHttpTools;
          this.isGroupMode = data.data.isGroupMode || this.isGroupMode;
          this.selectedGroupAgents = data.data.selectedGroupAgents || this.selectedGroupAgents;
          // Ensure consistent initial state
          this.edgettsLanguage = this.ttsSettings.edgettsLanguage;
          this.edgettsGender = this.ttsSettings.edgettsGender;
          this.handleSystemLanguageChange(this.systemSettings.language);
          this.refreshButtonText = this.t('refreshList');
          if (this.HASettings.enabled) {
            this.changeHAEnabled();
          };
          await this.initChromeMCPSettings();
          if (this.chromeMCPSettings.enabled){
            this.changeChromeMCPEnabled();
          }
          if (this.sqlSettings.enabled){
            this.changeSqlEnabled();
          }
          this.changeMemory();
          // Set this.target_lang from navigator.language or navigator.userLanguage
          this.target_lang = this.targetLangSelected!="system"? this.targetLangSelected: navigator.language || navigator.userLanguage || 'en-US';
          this.loadDefaultModels();
          this.loadDefaultMotions();
          this.loadGaussScenes();
          this.loadTHAModels();
          this.loadSoulxImages();
          this.checkMobile();
          this.checkTelegramBotStatus();
          this.checkDiscordBotStatus();
          this.checkLiveStatus();
          this.fetchRemotePlugins();
          this.fetchSkills();
          this.fetchTetosVoices(this.ttsSettings.engine);
          if (this.asrSettings.enabled && this.asrSettings.interactionMethod != 'globalKeyTriggered' && this.asrSettings.interactionMethod != 'keyTriggered') {
            this.startASR();
          }
          if (this.activeMenu === 'home') this.startDriverGuide();
        } 
        else if (data.type === 'task_notification') {
            // 1. Display frontend notification
            showNotification(`${data.data.title}\n${this.t('intask')}`, 'success');
            
            // 2. Trigger runBehavior to summarize conversation in the web client
            if (data.data.behavior) {
                // Ensure this refers to the correct component
                this.runBehavior(data.data.behavior);
            }
        }
        else if (data.type === 'diary_entry') {
            // Display generated diary content unchanged in current conversation
            if (data.data && data.data.content) {
                if (data.data.actionType === 'system_notify') {
                    const title = data.data.title || this.t('DiarySystem') || 'Diary';
                    showNotification(title + ': ' + data.data.content, 'warning');
                } else {
                    this.pushDiaryToChat(data.data.content, data.data.actionType);
                }
            }
        }
        else if (data.type === 'settings_saved') {
          if (!data.success) {
            showNotification(this.t('settings_save_failed'), 'error');
          }
        }
        // Handle user input updates
        else if (data.type === 'update_user_input') {
          this.userInput = data.data.text;
        }
        // Update or add a prompt
        else if (data.type === 'update_system_prompt') {
            const id = data.data.id;
            const text = data.data.text;
            this.extensionsSystemPromptsDict[id] = text; 
        }
        
        // Remove prompt (matching backend finally handling)
        else if (data.type === 'remove_system_prompt') {
            const id = data.data.id;
            
            if (this.extensionsSystemPromptsDict[id]) {
                delete this.extensionsSystemPromptsDict[id];
            }
        }
        // Handle tool input
        else if (data.type === 'update_tool_input') {
          this.userInput = data.data.text;
          this.sendMessage(role = 'system')
        }
        // Handle TTS input
        else if (data.type === 'start_tts') {
          this.readConfig.longText = data.data.text;
          // Wait 0.5 seconds
          setTimeout(() => {
            this.startRead();
          }, 500);
        }
        // Stop TTS
        else if (data.type === 'stop_tts') {
          this.stopTTSActivities();
          this.readConfig.longText = '';
        }
        // Handle extension sidebar closure
        else if (data.type === 'trigger_close_extension') {
          console.log('Close sidebar')
          this.resetToDefaultView();
        }
        // Handle message submission trigger
        else if (data.type === 'trigger_send_message') {
          this.sendMessage();
        }
        // Clear messages
        else if (data.type === "trigger_clear_message" ){
          this.clearMessages();
        }
        // Enqueue extension requests (such as sap-snack-director) for serial scheduling,
        // without interrupting generation or speech or dropping requests during isTyping.
        else if (data.type === 'live_enqueue') {
          this.enqueueLiveRequest(data.data);
        }
        // Synchronize messages from other windows
        else if (data.type === 'messages_update') {
          if (data.data && data.data.messages && !this.isSending) {
            this.messages = data.data.messages;
            if (data.data.conversationId) {
              this.conversationId = data.data.conversationId;
            }
            this.$nextTick(() => { this.requestScrollToBottom(); });
          }
        }
        // Respond to message-list requests
        else if (data.type === 'request_messages') {
          // Send current messages to requesting client
          this.sendMessagesToExtension();
        }
      };

      // WebSocket close event
      this.ws.onclose = (event) => {
        console.log('WebSocket connection closed:', event.reason);
        stopHeartbeat();
        scheduleReconnect();
      };

      // WebSocket error event
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.ws.close(); // Close actively to trigger onclose
      };
    },

    disconnectWebSocket() {
      if (this.ws) {
        try {
          this.ws.onopen = null;
          this.ws.onmessage = null;
          this.ws.onclose = null;
          this.ws.onerror = null;
          this.ws.close();
        } catch (e) {
          console.error('Error closing WebSocket:', e);
        }
        this.ws = null;
      }
    },

   async updateGlobalShortcut() {
      if (this.asrSettings.interactionMethod === 'globalKeyTriggered' || this.asrSettings.interactionMethod === 'keyTriggered'){
        this.stopASR();
      }else if (this.asrSettings.enabled){
        await this.startASR();
      }

      if (!window.electronAPI?.unregisterGlobalShortcut) return;
      
      // Unregister the old shortcut before updating
      await window.electronAPI.unregisterGlobalShortcut();

      // If ASR and global shortcut mode are enabled
      if (this.asrSettings.interactionMethod === 'globalKeyTriggered') {
        const globalKeyCombo = this.getGlobalAccelerator(this.asrSettings.hotkey);
        
        const success = await window.electronAPI.registerGlobalShortcut(globalKeyCombo);
        if (!success) {
          this.$message.error(`Failed to register global shortcut ${globalKeyCombo}; it may already be in use`);
        } else {
          console.log("Global shortcut updated to: " + globalKeyCombo);
        }
      }
    },

    // Convert the configured key to Electron accelerator format
    getGlobalAccelerator(localKey) {
      if (localKey === 'Alt') return 'Alt+Space';
      if (localKey === 'Control') return 'Control+Space';
      if (localKey === 'Shift') return 'Shift+Space';
      return 'Alt+Space'; // Default fallback
    },

    // Keydown handler (local keyTriggered mode only)
    async handleKeyDown(event) {
      if (event?.repeat) return; 
      if (event.isComposing || event.keyCode === 229) return;

      // ===== Shortcut popup navigation (first priority) =====
      if (this.shortcutMenuOpen && this.shortcutMenuItems.length) {
        if (event.key === 'ArrowDown') { event.preventDefault(); this.moveShortcutMenu(1); return; }
        if (event.key === 'ArrowUp') { event.preventDefault(); this.moveShortcutMenu(-1); return; }
        if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
          event.preventDefault();
          const item = this.shortcutMenuItems[this.shortcutMenuIndex] || this.shortcutMenuItems[0];
          if (item) this.selectShortcutMenuItem(item);
          return;
        }
        if (event.key === 'Escape') { event.preventDefault(); this.closeShortcutMenu(); return; }
      }

      // ====== Local push-to-talk mode ======
      if (this.asrSettings.interactionMethod === "keyTriggered") {
        // Require an exact match with the configured key
        if (event.key === this.asrSettings.hotkey) {
          event.preventDefault(); 
          await this.handlePttPress(event); // Start recording
          return; 
        }
      }

      // Existing playback and Enter-key handling below
      if (event.code === 'Space' && event.shiftKey) {
        event.preventDefault();
        if (this.readState.ttsChunks.length > 0 && !this.readState.isPlaying) {
          this.playNextSegmentOnce();
        }
        return;
      }
      
      const isTextArea = event.target.tagName === 'TEXTAREA';
      if (event.key === 'Enter' && (this.activeMenu === 'home' || this.activeMenu ==='ai-browser')) {
        if (isTextArea) {
            if (event.shiftKey) {
              return;
            } else {
              event.preventDefault();
              await this.sendMessage();
            }
        }
      }

      if (event.key === 'Enter' && this.activeMenu ==='dashboard') {
            if (event.shiftKey) {
              return;
            } else {
              event.preventDefault();
              this.handleDashboardSend();
            }
      }
    },

    // Keyup handler (local keyTriggered mode only)
    async handleKeyUp(event) {
      if (event?.repeat) return;

      // ====== Local release-to-stop mode ======
      if (this.asrSettings.interactionMethod === "keyTriggered") {
        if (event.key === this.asrSettings.hotkey) {
          event.preventDefault();
          await this.handlePttRelease(event); // Stop recording
          return;
        }
      }  
    },
    escapeHtml(unsafe) {
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    },  
    // Send the current message list to all connected clients
    sendMessagesToExtension() {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      if (this.isSending && this._lastExtSendTime && Date.now() - this._lastExtSendTime < 3000) {
        if (!this._extSendPending) {
          this._extSendPending = true;
          this._extSendTimer = setTimeout(() => {
            this._extSendPending = false;
            this._extSendTimer = null;
            this.sendMessagesToExtension();
          }, 3000);
        }
        return;
      }
      this._lastExtSendTime = Date.now();
      try {
        const MAX_WS_MESSAGES = 50;
        const recentMessages = this.messages.length > MAX_WS_MESSAGES
          ? this.messages.slice(-MAX_WS_MESSAGES)
          : this.messages;
        this.ws.send(JSON.stringify({
            type: 'broadcast_messages',
            data: {
              messages: recentMessages,
              conversationId: this.conversationId
            }
          }));
        } catch (e) {
          console.error('Failed to send messages to extension:', e);
        }
    },
    async syncSystemPromptToMessages(newPrompt) {
      // Case 1: new prompt is empty
      if (!newPrompt) {
        if (this.messages.length > 0 && this.messages[0].role === 'system') {
          this.messages.splice(0, 1); // Remove system message
        }
        return;
      }
  
      // Case 2: existing system message
      if (this.messages[0]?.role === 'system') {
        // Update system content
        this.messages[0].content = newPrompt;
        console.log('Updated system message:', this.messages[0]);
        return;
      }
  
      // Case 3: no system message
      this.messages.unshift({
        id: Date.now() + Math.random(), // Add unique ID
        role: 'system',
        content: newPrompt
      });
      console.log('Added system message:', this.messages[0]);
      await this.autoSaveSettings();
    },


    // Sensitive path detection
    isDangerousPath(path) {
        if (!path) return false;

        // 1. Normalize separators, lowercase and remove trailing slash
        let normalized = path.trim().replace(/\\/g, '/').toLowerCase();
        if (normalized.length > 1 && normalized.endsWith('/')) {
            normalized = normalized.slice(0, -1);
        }

        // --- A. Disallowed disk and system roots ---
        // Matches "c:", "d:", "/"
        const winRootRegex = /^[a-z]:$/;
        if (winRootRegex.test(normalized) || normalized === '/' || normalized === '') {
            return true; 
        }

        // --- B. Disallow container directory itself but allow subdirectories ---
        // For example, disallow C:/Users but allow C:/Users/YourName/Documents
        const userContainers = [
            'c:/users',
            '/users',
            '/home'
        ];
        if (userContainers.includes(normalized)) {
            return true;
        }

        // --- C. Disallow system core directories and their descendants ---
        // Local agents should not operate in these directories
        const strictSystemPaths = [
            'c:/windows',
            'c:/program files',
            'c:/program files (x86)',
            'c:/boot',
            'c:/recovery',
            'c:/system volume information',
            '/bin', '/boot', '/dev', '/etc', '/lib', '/lib64', '/proc', 
            '/root', '/run', '/sbin', '/sys', '/usr', '/var', '/opt',
            '/system', '/library', '/volumes'
        ];

        return strictSystemPaths.some(prefix => {
            // Intercept system core directories or their descendants
            return normalized === prefix || normalized.startsWith(prefix + '/');
        });
    },

    // ==========================================
    // 1. User action entry point and dispatcher
    // ==========================================
    // Dispatch recognized control shortcuts locally; return false for ordinary submission
    // Refresh shortcut popup visibility as input changes
    refreshShortcutMenu() {
      const items = this.shortcutMenuItems;
      this.shortcutMenuOpen = (this.shortcutMenuToken !== null) && items.length > 0;
      if (this.shortcutMenuIndex >= items.length) this.shortcutMenuIndex = 0;
    },
    moveShortcutMenu(delta) {
      const n = this.shortcutMenuItems.length;
      if (!n) return;
      this.shortcutMenuIndex = (this.shortcutMenuIndex + delta + n) % n;
    },
    closeShortcutMenu() {
      this.shortcutMenuOpen = false;
      this.shortcutMenuIndex = 0;
    },
    selectShortcutMenuItem(item) {
      if (!item) return;
      if (item.mode === 'fill') {
        // For commands requiring arguments, insert command and retain focus for user input
        this.userInput = item.insert + ' ';
        this.shortcutMenuOpen = false;
        this.shortcutMenuIndex = 0;
      } else {
        // Execute argument-free commands immediately
        this.closeShortcutMenu();
        this.handleShortcutCommand(item.insert);
        this.userInput = '';
      }
    },
    handleShortcutCommand(raw) {
        if (!raw || raw[0] !== '/') return false;
        const parts = raw.slice(1).split(/\s+/);
        if (!parts[0]) return false;
        const cmd = ('/' + parts[0]).toLowerCase();
        const arg = raw.slice(1 + parts[0].length).trim();
        const inAny = (list) => list.includes(cmd);
        try {
            if (inAny(['/help', '/?'])) { this.showShortcutHelp = true; return true; }
            if (inAny(['/stop'])) { this.stopGenerate(); return true; }
            if (inAny(['/new', '/reset', '/restart'])) { this.clearMessages(); return true; }
            if (inAny(['/retry'])) { this.shortcutRetry(); return true; }
            if (inAny(['/model'])) { this.shortcutSwitchModel(arg); return true; }
            if (inAny(['/personality', '/persona'])) { this.shortcutSwitchPersonality(arg); return true; }
            if (inAny(['/skills'])) { this.shortcutShowSkills(); return true; }
            const modeMap = {'/plan':'plan','/read':'default','/edit':'auto-approve','/yolo':'yolo','/cowork':'cowork','/goal':'goal'};
            if (modeMap[cmd]) { this.shortcutSwitchMode(modeMap[cmd]); return true; }
        } catch (e) {
            console.error('Shortcut command failed:', e);
            return true;
        }
        // Other skill injection (/<skill-name>) and # / @ commands use the normal backend flow
        return false;
    },
    // /retry: regenerate the last assistant reply
    shortcutRetry() {
        let idx = -1;
        for (let i = this.messages.length - 1; i >= 0; i--) {
            if (this.messages[i].role === 'assistant') { idx = i; break; }
        }
        if (idx > 0) { this.rewrite(idx); }
        else { showNotification(this.t('cmd_nothing_to_retry'), 'warning'); }
    },
    // /model: open the model picker without an argument, or match and switch
    shortcutSwitchModel(arg) {
        if (!arg) { this.showModelDialog = true; return; }
        const q = arg.toLowerCase().trim();
        let target = null;
        for (const p of (this.modelProviders || [])) {
            const vendor = (p.vendor || p.name || '').toLowerCase();
            const model = (p.modelId || '').toLowerCase();
            if (model === q || vendor === q || (vendor + ':' + model) === q ||
                (model && model.includes(q)) || (vendor && vendor.includes(q))) {
                target = p; break;
            }
        }
        if (target) {
            this.selectMainProvider(target.id);
            showNotification(this.t('cmd_model_switched') + ': ' + (target.modelId || target.vendor || ''), 'success');
        } else {
            this.showModelDialog = true;
            showNotification(this.t('cmd_model_notfound'), 'warning');
        }
    },
    // /personality: show the picker or match a character card / system prompt
    shortcutSwitchPersonality(arg) {
        if (!arg) {
            this.activeMenu = 'role';
            this.subMenu = 'memory';
            showNotification(this.t('cmd_personality_hint'), 'info');
            return;
        }
        const q = arg.toLowerCase().trim();
        const mem = (this.memories || []).find(m => (m.name || '').toLowerCase() === q);
        if (mem) {
            this.memorySettings.is_memory = true;
            this.memorySettings.selectedMemory = mem.id;
            this.changeMemory();
            showNotification(this.t('cmd_personality_switched') + ': ' + mem.name, 'success');
            return;
        }
        const prompt = (this.SystemPromptsList || []).find(p => (p.name || '').toLowerCase() === q);
        if (prompt) {
            this.usePrompt(prompt);
            showNotification(this.t('cmd_personality_switched') + ': ' + prompt.name, 'success');
            return;
        }
        showNotification(this.t('cmd_personality_notfound'), 'warning');
    },
    // /skills: open skill management
    shortcutShowSkills() {
        this.activeMenu = 'toolkit';
        this.subMenu = 'CLI';
        this.activeCLITab = 'skills';
    },
    // /plan /read /edit /yolo /cowork /goal: switch current engine permission mode (requires CLI control)
    shortcutSwitchMode(modeValue) {
        if (!this.CLISettings || !this.CLISettings.enabled) {
            showNotification(this.t('cmd_mode_need_cli'), 'warning');
            return;
        }
        const engine = this.CLISettings.engine;
        const key = engine === 'ds' ? 'dsSettings' : engine === 'acp' ? 'acpSettings' : engine === 'wsl' ? 'wslSettings' : 'localEnvSettings';
        if (!this[key]) this[key] = {};
        this[key].permissionMode = modeValue;
        this.autoSaveSettings();
        showNotification(this.t('cmd_mode_switched') + ': ' + modeValue, 'success');
    },
    async sendMessage(role = 'user') { 
        // Basic validation
        if (!this.userInput.trim() && (!this.files || this.files.length === 0) && (!this.images || this.images.length === 0)) return;
        if (this.isTyping) return;
        this.closeShortcutMenu();
        // Intercept web control shortcuts; skill injection, memory and file references follow normal flow
        if (this.systemSettings.enableShortcuts && role === 'user'
            && (!this.files || this.files.length === 0) && (!this.images || this.images.length === 0)
            && this.handleShortcutCommand(this.userInput.trim())) {
            this.userInput = '';
            return;
        }
        if (this.CLISettings.enabled) {
            const pathToCheck = this.CLISettings.cc_path;

            if (this.isDangerousPath(pathToCheck)) {
                showNotification(
                    this.t('dangerous_path_detected'),
                    'error',
                );
                return; // Return without further processing
            }

            // Continue if validation succeeds
        }
        // Switch menu
        if (this.activeMenu === 'dashboard'){
          this.activeMenu = 'home'
        }

        // Handle TTS and read-aloud interruption
        if (this.readState.isPlaying && this.ttsSettings.enabled) { 
            if (this.isReadRunning){
                this.pauseRead();
            } else {
                this.stopSegmentTTS(isEnd=false);
            }
            this.isReadInterruption = true;
        }

        if (this.messages.length > 0) {
            const lastMsg = this.messages[this.messages.length - 1];
            if (lastMsg._currentAudio){
                if (typeof lastMsg._currentAudio.pause === 'function') {
                    lastMsg._currentAudio.pause();
                }
                lastMsg._currentAudio = null;
            }
        }
        this.stopAllAudioPlayback();
        this.TTSrunning = false;

        if ((this.vrmOnline || this.vtsOnline) && this.ttsWebSocket) {
            this.ttsWebSocket.send(JSON.stringify({ type: 'ttsStarted', data: {} }));
        }

        this.isTyping = true;
        this.startTimer();

        if (typeof this.sendTTSStatusToVRM === 'function') {
            this.sendTTSStatusToVRM('ttsStarted', {});
        }

      let captureFlag = false;
      if (this.isElectron && this.visionSettings?.desktopVision) {
          if (this.visionSettings.enableWakeWord && this.visionSettings.wakeWord) {
              const wakeWords = this.visionSettings.wakeWord.split('\n');
              if (wakeWords.some(word => this.userInput.includes(word.trim()))) {
                  captureFlag = true;
              }
          } else {
              captureFlag = true;
          }
      }

        // --- File upload handling ---
        const userInput = this.userInput.trim();
        let fileLinks = this.files || [];
        
        if (fileLinks.length > 0){
            const formData = new FormData();
            for (const file of fileLinks) {
                if (file.file instanceof Blob) { 
                    formData.append('files', file.file, file.name);
                }
            }
            try {
                const response = await fetch(`/load_file`, { method: 'POST', body: formData });
                const data = await response.json();
                if (data.success) {
                    fileLinks = data.fileLinks;
                    this.textFiles = [...this.textFiles, ...data.textFiles];
                }
            } catch (error) { console.error(error); }
        }

        let imageLinks = this.images || [];
        if (imageLinks.length > 0){
            const formData = new FormData();
              for (const file of imageLinks) {
                  if (file.file instanceof Blob) { 
                      formData.append('files', file.file, file.name , file.detectedType); // Include detectedType
                  } 
              }
              try {
                  const response = await fetch(`/load_file`, { method: 'POST', body: formData });
                  const data = await response.json();
                  if (data.success) {
                    imageLinks = data.fileLinks;
                    this.imageFiles = [...this.imageFiles, ...data.imageFiles];
                    if(data.vedioFiles) { // Support video files
                        this.vedioFiles = [...(this.vedioFiles || []), ...data.vedioFiles];
                    }
                  }
              } catch (error) { console.error(error); }
        }

        // Ensure this.fileLinks is an array
        if (!Array.isArray(this.fileLinks)) {
            this.fileLinks = []; 
        }

        // Construct file-link text
        const fileLinks_content = fileLinks.map(fileLink => `\n[Filename: ${fileLink.name}\nFile link: ${fileLink.path}]`).join('\n') || '';
        const fileLinks_list = Array.isArray(fileLinks) ? fileLinks.map(fileLink => fileLink.path).flat() : []
        this.fileLinks = this.fileLinks.concat(fileLinks_list)

        // --- Push user message to UI ---
        this.messages.push({
            id: Date.now() + Math.random(),
            role: role,
            content: userInput,
            fileLinks: fileLinks,
            fileLinks_content: fileLinks_content,
            imageLinks: imageLinks || [],
            hasDesktopVision: captureFlag, // Mark messages that trigger backend screenshot capture
            agentName: this.memorySettings.userName || 'User',
            timestamp: Date.now() // Record send time
        });

        this.sendMessagesToExtension();
        this.files = [];
        this.images = [];
        this.userInput = '';
        
        this.$nextTick(() => { this.requestScrollToBottom(); });

        // Create conversation early for incremental saving during long streamed replies
        this.ensureConversationCreated();

        // --- Dispatch: group chat or individual chat ---
        this.isSending = true; 
        this.abortController = new AbortController(); 

        try {
                if (this.isGroupMode && this.selectedGroupAgents && this.selectedGroupAgents.length > 0) {
                    // Group chat: randomized serial calls
                    
                    // Copy and shuffle using Fisher-Yates
                    let executionList = [...this.selectedGroupAgents];
                    for (let i = executionList.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [executionList[i], executionList[j]] = [executionList[j], executionList[i]];
                    }

                    // Iterate the shuffled list
                    for (const targetId of executionList) {
                        if (this.abortController.signal.aborted) break;

                        let agentDisplayName = "Unknown";
                        
                        // Resolve display name
                        if (targetId.startsWith('memory/')) {
                            const memId = targetId.split('/')[1];
                            // Check this.memories before calling find
                            const memRecord = this.memories && this.memories.find(m => String(m.id) === String(memId));
                            agentDisplayName = memRecord ? memRecord.name : "Role";
                        } else if (targetId === 'super-model') {
                            agentDisplayName = this.t('defaultAgent');
                        } else if (this.agents[targetId]) {
                            agentDisplayName = this.agents[targetId].name;
                        }

                        // Call generation function
                        await this.generateAIResponse(targetId, agentDisplayName);
                    }
                } else {
                    // Individual chat
                    let currentName = 'Assistant';

                    // 1. Check character-card enable switch and selected card ID
                    if (this.memorySettings && this.memorySettings.is_memory && this.memorySettings.selectedMemory) {
                        const selectedId = this.memorySettings.selectedMemory;
                        
                        // Ensure memories exists and compare IDs as strings to handle numeric/string mismatches
                        const memRecord = this.memories && this.memories.find(m => String(m.id) === String(selectedId));
                        if (memRecord) {
                            currentName = memRecord.name;
                        } else {
                            // Fallback
                            currentName = "Role";
                        }
                    } 
                    // 2. Otherwise show the current default agent name
                    else if (this.mainAgent === 'super-model') {
                        currentName = this.t('defaultAgent');
                    } else if (this.agents && this.agents[this.mainAgent]) {
                        currentName = this.agents[this.mainAgent].name;
                    }

                    await this.generateAIResponse(this.mainAgent, currentName);
                }
        } catch (e) {
            console.error("Chat dispatch error:", e);
        } finally {
          this.isTyping = false;
          this.isSending = false;
          this.abortController = null;
          try {
            await this.autoSaveSettings();
          } catch (e) {
            console.error("autoSaveSettings failed:", e);
          }
          try {
            await this.saveConversations();
          } catch (e) {
            console.error("saveConversations failed:", e);
          }
        }
    },


    // ==========================================
    // 2. AI generation and streaming with human approval
    // ==========================================
    async generateAIResponse(targetAgentId, agentDisplayName = null, isResume = false) {

        const currentController = this.abortController;
        let _saveInterval = null;

        if (!isResume && !this.ttsSettings.enabled && (this.vrmOnline || this.vtsOnline) && this.ttsWebSocket) {
            this.sendTTSStatusToVRM('ttsStarted', {});
        }

        this.voiceStack = ['default'];
        let tts_buffer = '';
        let isCodeBlock = false;
        this.cur_voice = 'default';

        const toolCallStack = [];
        this.toolArgsAccumulator = this.toolArgsAccumulator || {};

        // Internal helper: prepare API message history
        const prepareMessages = (msgs) => {
            const rawMessages = msgs.flatMap(msg => {
                const userName = this.memorySettings?.userName || 'User';

                // --- 1. Human user and group-chat messages ---
                if (this.isGroupMode && (msg.role === 'user' || (msg.role === 'assistant' && msg.agentName !== agentDisplayName))) {
                    let textContent = (msg.pure_content ?? msg.content) + (msg.fileLinks_content ?? '');
                    const prefix = msg.role === 'user' ? userName : msg.agentName;
                    const finalContent = `${prefix}: ${textContent}`;

                    if (msg.imageLinks && msg.imageLinks.length > 0) {
                        const contentArray = [{ type: "text", text: finalContent }];
                        msg.imageLinks.forEach(imageLink => {
                            const ext = imageLink.path.split('.').pop().toLowerCase();
                            const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'avi'];
                            if (videoExts.includes(ext)) {
                                contentArray.push({ type: "video_url", video_url: { url: imageLink.path } });
                            } else {
                                contentArray.push({ type: "image_url", image_url: { url: imageLink.path } });
                            }
                        });
                        return [{ role: 'user', content: contentArray }];
                    } else {
                        return [{ role: 'user', content: finalContent }];
                    }
                }

                if (msg.role === 'assistant' && msg.backend_content && msg.backend_content.length > 0) {
                    return msg.backend_content.filter(m => 
                        (m.content && String(m.content).trim() !== '') || 
                        (m.tool_calls && m.tool_calls.length > 0) || 
                        m.role === 'tool'
                    );
                }
                
                let apiRole = msg.role === 'system' ? 'system' : (msg.role === 'assistant' ? 'assistant' : 'user');
                let textContent = (msg.pure_content ?? msg.content) + (msg.fileLinks_content ?? '');
                
                // --- 2. Individual and ordinary chat messages ---
                if (msg.imageLinks && msg.imageLinks.length > 0) {
                    const contentArray = [{ type: "text", text: textContent }];
                    msg.imageLinks.forEach(imageLink => {
                        const ext = imageLink.path.split('.').pop().toLowerCase();
                        const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'avi'];
                        if (videoExts.includes(ext)) {
                            contentArray.push({ type: "video_url", video_url: { url: imageLink.path } });
                        } else {
                            contentArray.push({ type: "image_url", image_url: { url: imageLink.path } });
                        }
                    });
                    return [{ role: apiRole, content: contentArray }];
                } else {
                    return [{ role: apiRole, content: textContent }];
                }
            });

            const sanitized =[];
            for (let i = 0; i < rawMessages.length; i++) {
                const current = rawMessages[i];
                if (current.role === 'tool') {
                    let prev = sanitized.length > 0 ? sanitized[sanitized.length - 1] : null;
                    if (!prev || prev.role !== 'assistant') {
                        prev = { role: 'assistant', content: null, tool_calls:[] };
                        sanitized.push(prev);
                    }
                    if (!prev.tool_calls) prev.tool_calls =[];
                    
                    const safeToolCallId = current.tool_call_id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                    current.tool_call_id = safeToolCallId;

                    const hasMatchingId = prev.tool_calls.some(tc => tc.id === safeToolCallId);
                    if (!hasMatchingId) {
                        prev.tool_calls.push({
                            id: safeToolCallId,
                            type: 'function',
                            function: { name: current.name || 'unknown_tool', arguments: "{}" }
                        });
                    }
                }
                sanitized.push(current);
            }
            return sanitized;
        };

        // Step one: assemble payload
        let messagesPayload = prepareMessages(this.messages);
        if (this.extensionsSystemPromptsDict) {
            const combinedPrompt = Object.values(this.extensionsSystemPromptsDict).filter(Boolean).join('\n\n');
            if (messagesPayload[0]?.role === 'system') messagesPayload[0].content += '\n\n' + combinedPrompt;
            else messagesPayload.unshift({ role: 'system', content: combinedPrompt });
        }

        let currentMsg;
        let shouldSyncGroupMemory = false;
        if (isResume && this.messages.length > 0) {
            currentMsg = this.messages[this.messages.length - 1];
            currentMsg.generationFinished = false;
        } else {
            const newMsgData = {
                id: Date.now() + Math.random(),
                role: 'assistant',
                agentName: agentDisplayName,
                content: '',         // HTML no longer needed; cleared at completion
                pure_content: '',
                backend_content: [{ role: 'assistant', content: '' }],
                toolBlocks: {},
                displayBlocks: [],
                segments: null,
                isOmni: this.settings.enableOmniTTS || this.fastSettings.enableOmniTTS,
                omniAudioChunks: [], ttsChunks: [], chunks_voice: [], audioChunks: [],
                isPlaying: false, total_tokens: 0, first_token_latency: 0, elapsedTime: 0,
                generationFinished: false,
                timestamp: Date.now() // Record generation time
            };
            this.messages.push(newMsgData);
            currentMsg = this.messages[this.messages.length - 1];
        }
        const latestUserMessage = [...this.messages].reverse().find(msg => msg.role === 'user');

        // Block lookup helper with freezing and stream reuse
        const getBlock = (type, id = null, name = null) => {
            if (!currentMsg.displayBlocks) currentMsg.displayBlocks = [];
            const blocks = currentMsg.displayBlocks;
           
            while (blocks.length > 0 && Object.isFrozen(blocks[0]) && blocks.length >= MAX_RENDERED_BLOCKS) {
                blocks.shift();
            }
            if (blocks.length > MAX_RENDERED_BLOCKS + 5) {
                const removeCount = blocks.length - MAX_RENDERED_BLOCKS;
                blocks.splice(0, removeCount);
            }

            // Find an existing block by ID, e.g. tool_call/tool_result
            if (id) {
                const existing = blocks.find(b => b.type === type && b.id === id);
                if (existing) {
                    if (name && !existing.name) existing.name = name;
                    return existing;
                }
            }
            
            // Reuse the last block if type matches and it is not frozen
            const last = blocks[blocks.length - 1];
            const canReuse = last && last.type === type && !Object.isFrozen(last) && (!id || last.id === id);
            if (canReuse) {
                if (name && !last.name) last.name = name;
                return last;
            }
            
            // Otherwise freeze the previous block of a different type
            if (last && !Object.isFrozen(last)) {
                // Never freeze blocks containing complex objects or approval blocks; preserve Vue proxy invariants
                if (last.type !== 'approval' && !last.data) {
                    Object.freeze(last);
                    if (typeof last.content === 'string') Object.freeze(last.content);
                    if (typeof last.args === 'string') Object.freeze(last.args);
                }
            }
            
            // Create block and append to array
        const newBlock = { type, id, name, content: '', args: '', data: null, segments: null };
            blocks.push(newBlock);
            return newBlock;
        };

        this.$nextTick(() => { this.requestScrollToBottom(); });

        let audioResolve = null;
        let audioProcess = null;
        const audioPromise = new Promise((resolve) => { audioResolve = resolve; });
        if (this.ttsSettings.enabled) {
            this.startTTSProcess(currentMsg);
            this.startAudioPlayProcess(currentMsg, audioResolve);
            audioProcess = audioPromise;
        }

        const escapeHtml = (text) => {
            if (!text) return '';
            return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        };

        try {
            _saveInterval = setInterval(() => this.saveCurrentConversation(), 30000);
            const MAX_FETCH_RETRIES = 3;
            const RETRY_BASE_DELAY = 1000;
            let lastFetchError = null;
            let response = null;

            for (let retryAttempt = 0; retryAttempt <= MAX_FETCH_RETRIES; retryAttempt++) {
                try {
                    if (retryAttempt > 0) {
                        if (this.abortController?.signal.aborted) throw new DOMException('User aborted', 'AbortError');
                        const delay = RETRY_BASE_DELAY * Math.pow(2, retryAttempt - 1);
                        console.log("[Retry] fetch /v1/chat/completions attempt " + retryAttempt + "/" + MAX_FETCH_RETRIES + ", waiting " + delay + "ms...");
                        await new Promise(r => setTimeout(r, delay));
                    }

                    const abortSignal = this.abortController.signal;

                    response = await fetch(`/v1/chat/completions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: targetAgentId,
                            messages: messagesPayload,
                            stream: true,
                            fileLinks: this.fileLinks,
                            asyncToolsID: this.asyncToolsID || [],
                            reasoning_effort: this.reasoning_effort,
                            conversation_id: this.stringifyEntityId(this.conversationId),
                            group_id: this.stringifyEntityId(this.activeConversationGroupId || this.draftConversationGroupId || 'default'),
                            user_message_id: this.stringifyEntityId(latestUserMessage?.id || null),
                        }),
                        signal: abortSignal
                    });

                    if (response.ok) break;
                    if (response.status >= 400 && response.status < 500) break;
                    if (retryAttempt < MAX_FETCH_RETRIES) {
                        lastFetchError = new Error(`Server error: ${response.status}`);
                        console.log("[Retry] HTTP " + response.status + ", retrying...");
                        continue;
                    }
                } catch (e) {
                    lastFetchError = e;
                    if (e.name === 'AbortError') throw e;
                    if (retryAttempt < MAX_FETCH_RETRIES) {
                        console.log("[Retry] Network error: " + e.message + ", retrying...");
                        continue;
                    }
                    throw e;
                }
            }

            if (!response || !response.ok) {
                let errText = response ? await response.text() : '';
                try { const errObj = JSON.parse(errText); errText = errObj.error?.message || errText; } catch (e) { }
                throw new Error(errText || lastFetchError?.message || 'Request failed after retries');
            }

            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('text/event-stream')) {
                let errText = await response.text();
                try { const errObj = JSON.parse(errText); errText = errObj.error?.message || errText; } catch (e) { }
                throw new Error(errText || 'Server returned non-streaming response');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            // Initialize batched streaming-text updates
            this._streamTargetMsg = currentMsg;
            this._streamTextBuffer = '';
            this._typewriterSpeed = 30;
            this._startTypewriterTick();
            this.first_token = true;
            const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
            let lastDataTime = Date.now();
            let streamFinished = false;
            while (true) {
                if (this.abortController?.signal.aborted) break;

                const remainingIdle = IDLE_TIMEOUT_MS - (Date.now() - lastDataTime);
                if (remainingIdle <= 0) {
                    console.error('Stream idle timeout (30min), aborting');
                    this.abortController?.abort();
                    throw new DOMException('Response stream idle timeout', 'TimeoutError');
                }

                let readResult;
                try {
                    readResult = await Promise.race([
                        reader.read(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Read timeout')), remainingIdle))
                    ]);
                } catch (readErr) {
                    if (readErr.message === 'Read timeout') {
                        console.error('Stream idle timeout (30min), aborting');
                        this.abortController?.abort();
                        throw new DOMException('Response stream idle timeout', 'TimeoutError');
                    }
                    throw readErr;
                }
                const { done, value } = readResult;
                if (done) break;
                lastDataTime = Date.now();
                buffer += decoder.decode(value, { stream: true });

                while (buffer.includes('\n\n')) {
                    const eventEndIndex = buffer.indexOf('\n\n');
                    const eventData = buffer.slice(0, eventEndIndex);
                    buffer = buffer.slice(eventEndIndex + 2);

                    if (eventData.startsWith('data: ')) {
                        const jsonStr = eventData.slice(6).trim();
                        if (!jsonStr) continue;
                        if (jsonStr === '[DONE]') { streamFinished = true; break; }
                        let parsed;
                        try {
                            parsed = JSON.parse(jsonStr);
                        } catch (parseErr) {
                            console.warn('SSE parse error, skipping chunk:', parseErr.message, jsonStr.slice(0, 200));
                            continue;
                        }
                        const delta = parsed.choices?.[0]?.delta;
                        if (!delta) continue;

                        if (delta._safety_filtered) {
                            currentMsg.pure_content = delta.content;
                            currentMsg.content = delta.content;
                            currentMsg.backend_content = [{ role: 'assistant', content: delta.content }];
                            currentMsg.displayBlocks = [{ type: 'text', content: delta.content }];
                            this._streamTextBuffer = null;
                            this.streamUpdateTimer = true;
                            continue;
                        }

                        if (this.first_token && !isResume) {
                            this.first_token = false;
                            this.stopTimer();
                            currentMsg.first_token_latency = this.elapsedTime;
                        }

                        // A. Reasoning: update displayBlocks without concatenating HTML
                        if (delta.reasoning_content) {
                            const block = getBlock('reasoning');
                            block.content += delta.reasoning_content;

                            let lastBackend = currentMsg.backend_content[currentMsg.backend_content.length - 1];
                            // If the last entry is not an assistant or already contains completed content
                            if (!lastBackend || lastBackend.role !== 'assistant' || (lastBackend.content && lastBackend.content.trim() !== '')) {
                                lastBackend = { role: 'assistant', content: '', reasoning_content: '' };
                                currentMsg.backend_content.push(lastBackend);
                            }
                            lastBackend.reasoning_content = (lastBackend.reasoning_content || '') + delta.reasoning_content;
                        }

                        // B. Content: debounced streaming updates
                        if (delta.content) {

                            if (!this._streamTextBuffer) {
                                const blocks = currentMsg.displayBlocks;
                                const lastBlock = blocks && blocks.length > 0 ? blocks[blocks.length - 1] : null;
                                if (lastBlock && lastBlock.type !== 'text') {
                                    this._streamTextBuffer += '\n\n';
                                }
                            }

                            // Buffer text rather than manipulating the DOM
                            this._streamTextBuffer += delta.content;

                            // Store text in backend_content to preserve multi-turn history
                            const lastBackend = currentMsg.backend_content[currentMsg.backend_content.length - 1];
                            if (lastBackend && lastBackend.role === 'assistant') {
                                lastBackend.content = (lastBackend.content || '') + delta.content;
                            } else {
                                currentMsg.backend_content.push({ role: 'assistant', content: delta.content });
                            }

                            const accumulatedText = lastBackend ? (lastBackend.content || '') : '';

                            // === Main handling branches ===
                            if (this.ttsSettings.enabled) {
                                // 1. Use the streaming state machine to turn delta.content into clean speech text
                                const readableText = this.processMarkdownStreamForTTS(currentMsg, delta.content, false);
                                tts_buffer += readableText;

                                // 2. Split accumulated speech-ready text into sentences for TTS
                                const { chunks, chunks_voice, remaining, remaining_voice } = this.splitTTSBuffer(tts_buffer);
                                if (chunks.length > 0) {
                                    currentMsg.chunks_voice.push(...chunks_voice);
                                    currentMsg.ttsChunks.push(...chunks);
                                }
                                tts_buffer = remaining;
                                this.cur_voice = remaining_voice;
                            } else {
                                // === Text and expression synchronization when TTS is disabled ===
                                if ((this.vrmOnline || this.vtsOnline) && this.ttsWebSocket) {
                                    // Extract expression and motion tags from accumulated text
                                    const detectedExpressions = [];
                                    const tagRegex = /[\[\(\*]([a-zA-Z_0-9\u4e00-\u9fa5]+)[\]\)\*]/g;
                                    let match;
                                    
                                    while ((match = tagRegex.exec(accumulatedText)) !== null) {
                                        const tag = match[1].toLowerCase().trim();
                                        detectedExpressions.push(tag);
                                    }

                                    // Send accumulated text and motion tags to VRM
                                    this.sendTTSStatusToVRM('omniStreaming', {
                                        text: accumulatedText,
                                        expressions: detectedExpressions
                                    });
                                }
                            }

                        }

                        // C. Tool loading state (tool_progress): update displayBlocks only
                        if (delta.tool_progress) {
                            const progress = delta.tool_progress;
                            let toolCallId = progress.tool_call_id || progress.id;

                            if (!toolCallId) {
                                const existingCall = toolCallStack.find(c => c.name === progress.name && !c.resolved);
                                if (existingCall) { toolCallId = existingCall.id; }
                                else {
                                    toolCallId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                                    toolCallStack.push({ id: toolCallId, name: progress.name, resolved: false });
                                }
                            } else if (!toolCallStack.find(c => c.id === toolCallId)) {
                                toolCallStack.push({ id: toolCallId, name: progress.name, resolved: false });
                            }

                            let accArgs = this.toolArgsAccumulator[toolCallId] || "";
                            if (progress.arguments !== undefined) {
                                if (progress.arguments.startsWith(accArgs) && accArgs !== "") {
                                    accArgs = progress.arguments;
                                } else {
                                    accArgs += progress.arguments;
                                }
                                this.toolArgsAccumulator[toolCallId] = accArgs;
                            }

                            const b = getBlock('tool_call', toolCallId, progress.name);
                            b.args = accArgs;
                            this.requestScrollToBottom();
                            continue;
                        }

                        // D. Results, errors and approvals: update displayBlocks and backend_content
                        if (delta.tool_content) {
                            const tool = delta.tool_content;
                            const toolName = tool.title || 'unknown';
                            let toolCallId = delta.tool_call_id || delta.async_tool_id;

                            if (tool.type === 'call') {
                                if (!toolCallId) toolCallId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                                toolCallStack.push({ id: toolCallId, name: toolName, resolved: false });
                            } else {
                                if (!toolCallId) {
                                    const pendingCall = toolCallStack.find(c => c.name === toolName && !c.resolved);
                                    if (pendingCall) {
                                        toolCallId = pendingCall.id; pendingCall.resolved = true;
                                    } else { toolCallId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; }
                                }
                                const callItem = toolCallStack.find(c => c.id === toolCallId);
                                if (callItem) callItem.resolved = true;
                            }

                            if (delta.async_tool_id && (tool.type === 'tool_result' || tool.type === 'error')) {
                                if (this.asyncToolsID) {
                                    const index = this.asyncToolsID.indexOf(delta.async_tool_id);
                                    if (index > -1) {
                                        this.asyncToolsID.splice(index, 1);
                                        const stackIndex = toolCallStack.findIndex(c => c.id === delta.async_tool_id);
                                        if (stackIndex > -1) toolCallStack.splice(stackIndex, 1);
                                    }
                                }
                            }

                            let isApproval = false;
                            let approvalData = null;

                            if (tool.type === 'tool_approval') {
                                isApproval = true;
                                try { approvalData = JSON.parse(tool.content); } catch (e) { }
                            } else if (tool.type === 'tool_result' && typeof tool.content === 'string' && tool.content.includes('"approval_required"')) {
                                try {
                                    const temp = JSON.parse(tool.content);
                                    if (temp.type === 'approval_required') { isApproval = true; approvalData = temp; }
                                } catch (e) { }
                            }

                            // Approval handling
                            if (isApproval && approvalData) {
                                const b = getBlock('approval', toolCallId, toolName);
                                b.data = approvalData;
                                this.approvalMap[toolCallId] = approvalData;

                                // Update backend_content directly without generating HTML
                                currentMsg.backend_content.push({ role: 'tool', tool_call_id: toolCallId, name: toolName, content: "{}" });
                                currentMsg.backend_content.push({ role: 'assistant', content: '' });
                                this.requestScrollToBottom();

                                // Stop receiving the stream as soon as an approval block arrives; wait for user action
                                if (this.abortController) {
                                    this.abortController.abort();
                                }
                                break; // Exit stream-reading loop
                            }
                            else if (tool.type === 'tool_result_stream' && tool.title === "tool_result_stream") {
                                const targetBlock = getBlock('tool_result', toolCallId, toolName);
                                
                                // Limit UI text size to prevent DOM hangs
                                if (targetBlock.content.length < 50000) {
                                    targetBlock.content = this.smartMergeTerminal(targetBlock.content, tool.content);
                                } else if (!targetBlock.content.endsWith('\n... (Display Truncated)')) {
                                    targetBlock.content += '\n... (Display Truncated)';
                                }

                                // Update backend_content while bounding backend history size
                                const lastToolIndex = currentMsg.backend_content.length - 1;
                                for (let i = lastToolIndex; i >= 0; i--) {
                                    if (currentMsg.backend_content[i].role === 'tool' && currentMsg.backend_content[i].tool_call_id === toolCallId) {
                                        if (currentMsg.backend_content[i].content.length < 15000) {
                                            currentMsg.backend_content[i].content = this.smartMergeTerminal(currentMsg.backend_content[i].content, tool.content);
                                        } else if (!currentMsg.backend_content[i].content.endsWith('\n... (Truncated)')) {
                                            currentMsg.backend_content[i].content += '\n... (Truncated)';
                                        }
                                        break;
                                    }
                                }
                            } else {
                                let bType = 'tool_result';
                                if (tool.type === 'error') bType = 'error';
                                else if (tool.type === 'call') bType = 'tool_call';

                                const targetBlock = getBlock(bType, toolCallId, toolName);
                                
                                // Truncate display text only
                                if (tool.type === 'call') {
                                    targetBlock.args = tool.content;
                                } else {
                                    targetBlock.content = this.truncateDisplayContent(tool.content);
                                }

                                // Store original content for history, with context-protecting truncation if needed
                                let rawContent = tool.content || '';
                                
                                // Pretruncate large files or output to avoid overloading WebSocket
                                if (tool.type !== 'call' && rawContent.length > 15000) {
                                    rawContent = rawContent.slice(0, 15000) + '\n... (Truncated)';
                                }

                                if (tool.type === 'call') {
                                    let lastIdx = currentMsg.backend_content.length - 1;
                                    let last = currentMsg.backend_content[lastIdx];
                                    
                                    // If the newest node is frozen from an older bug, clone it to make it writable
                                    if (last && Object.isFrozen(last)) {
                                        last = { ...last };
                                        currentMsg.backend_content[lastIdx] = last;
                                    }

                                    const actualArgs = rawContent || "{}"; // Extract actual arguments
                                    
                                    if (last && last.role === 'assistant') {
                                        // Clone possibly frozen tool_calls to make them writable
                                        if (!last.tool_calls) {
                                            last.tool_calls = [];
                                        } else if (Object.isFrozen(last.tool_calls)) {
                                            last.tool_calls = [...last.tool_calls];
                                        }

                                        let existingCall = last.tool_calls.find(tc => tc.id === toolCallId);
                                        if (!existingCall) {
                                            last.tool_calls.push({ id: toolCallId, type: 'function', function: { name: tool.title, arguments: actualArgs } });
                                        } else {
                                            // Deep-copy a frozen existingCall to make it writable
                                            let callIdx = last.tool_calls.indexOf(existingCall);
                                            if (callIdx !== -1 && Object.isFrozen(existingCall)) {
                                                existingCall = JSON.parse(JSON.stringify(existingCall));
                                                last.tool_calls[callIdx] = existingCall;
                                            }
                                            existingCall.function.arguments = actualArgs; // Replace placeholder with actual arguments
                                        }
                                    } else {
                                        currentMsg.backend_content.push({ role: 'assistant', content: null, tool_calls:[{ id: toolCallId, type: 'function', function: { name: tool.title, arguments: actualArgs } }] });
                                    }
                                } else if (tool.type === 'tool_result' || tool.type === 'tool_result_stream' || tool.type === 'error') {
                                    const hide = this.toolsSettings?.hideToolResults?.enabled && tool.type === 'tool_result';
                                    rawContent = hide ? '<hide to save token>' : rawContent;
                                    let updated = false;
                                    for (let i = currentMsg.backend_content.length - 1; i >= 0; i--) {
                                        if (currentMsg.backend_content[i].role === 'tool' && currentMsg.backend_content[i].tool_call_id === toolCallId) {
                                            currentMsg.backend_content[i].content = rawContent;
                                            updated = true;
                                            break;
                                        }
                                    }
                                    if (!updated) {
                                        currentMsg.backend_content.push({ role: 'tool', tool_call_id: toolCallId, name: toolName, content: rawContent });
                                    }
                                    if (currentMsg.backend_content[currentMsg.backend_content.length - 1].role !== 'assistant') {
                                        currentMsg.backend_content.push({ role: 'assistant', content: '' });
                                    }
                                }
                            }
                            this.requestScrollToBottom();
                        }

                        if (delta.audio?.data) {
                            this.playPCMChunk(delta.audio.data, currentMsg.pure_content, currentMsg);
                        }
                        if (parsed.usage?.total_tokens) {
                            currentMsg.total_tokens += parsed.usage.total_tokens;
                        }
                        if (delta.async_tool_id) {
                            if (!this.asyncToolsID) this.asyncToolsID = [];
                            if (!this.asyncToolsID.includes(delta.async_tool_id)) {
                                this.asyncToolsID.push(delta.async_tool_id);
                            }
                        }

                        this.sendMessagesToExtension();
                    }
                }
                if (streamFinished) break;
            }

            // Stop typewriter animation and flush remaining text at loop end
            this._typewriterRunning = false;
            this._typewriterTickCount = 0;
            if (this._typewriterRafId) cancelAnimationFrame(this._typewriterRafId);
            this.flushStreamTextBuffer();

            // === Flush all remaining text from the streaming state machine ===
            if (this.ttsSettings.enabled) {
                const finalReadable = this.processMarkdownStreamForTTS(currentMsg, '', true);
                tts_buffer += finalReadable;
            }

            if (tts_buffer.trim() && this.ttsSettings.enabled) {
                currentMsg.chunks_voice.push(this.cur_voice);
                currentMsg.ttsChunks.push(tts_buffer);
            }

            currentMsg.generationFinished = true;

            if (this.isElectron && this.systemSettings.enableNotifications && !document.hasFocus()) {
              window.electronAPI.showNotification('Super Agent Party', this.t('aiGenerationComplete'));
            }

            if (this.ttsSettings.enabled) {
                // Notify FlashHead that audio input is complete so tail frames can be generated
                setTimeout(() => { this.sendTTSStatusToVRM('audioInputComplete', {}); }, 0);
                if (this.audioStartTime > this.audioCtx.currentTime) {
                    const remainingTime = (this.audioStartTime - this.audioCtx.currentTime) * 1000;
                    setTimeout(() => { this.sendTTSStatusToVRM('allChunksCompleted', {}); }, remainingTime);
                } else {
                    this.sendTTSStatusToVRM('allChunksCompleted', {});
                }
            }

        } catch (error) {
            console.error(error);
            if (error.name !== 'AbortError' && error.name !== 'TimeoutError') {
                showNotification(error.message, 'error');
                const b = getBlock('error', 'err', 'System Error');
                b.content = this.truncateDisplayContent(error.message);
                if (currentMsg) {
                    const fallbackText = 'response error';
                    if (!currentMsg.pure_content && currentMsg.backend_content.length <= 1) {
                        currentMsg.pure_content = fallbackText;
                        currentMsg.backend_content = [{ role: 'assistant', content: fallbackText }];
                    } else {
                        const lastBackend = currentMsg.backend_content[currentMsg.backend_content.length - 1];
                        if (lastBackend && lastBackend.role === 'assistant' && lastBackend.tool_calls) {
                            delete lastBackend.tool_calls;
                        }
                        currentMsg.backend_content.push({ role: 'assistant', content: fallbackText });
                    }
                }
            }
            if (audioResolve) audioResolve();
        } finally {
            clearInterval(_saveInterval);
            this.isSending = false;
            this.isTyping = false;
            this.voiceStack = ['default'];
            if (this.allBriefly) currentMsg.briefly = true;

            // Clear the unused HTML content field
            if (currentMsg) {
                currentMsg.generationFinished = true; 
                currentMsg.content = ''; // Clear content field
            }

            // Deduplicate and save messages
            this.ensureConversationCreated();

            // Truncate overly long tool content in history to protect model context
            if (currentMsg && currentMsg.backend_content) {
                const AI_MAX_TOOL_LENGTH = 15000;
                currentMsg.backend_content.forEach(item => {
                    if (item.role === 'tool' && item.content && typeof item.content === 'string') {
                        if (item.content.length > AI_MAX_TOOL_LENGTH) {
                            item.content = item.content.slice(0, AI_MAX_TOOL_LENGTH) + '\n... (Truncated)';
                        }
                    }
                });
                const MAX_BACKEND_ENTRIES = 60;
                if (currentMsg.backend_content.length > MAX_BACKEND_ENTRIES) {
                    currentMsg.backend_content = currentMsg.backend_content.slice(
                        currentMsg.backend_content.length - MAX_BACKEND_ENTRIES
                    );
                }
            }

            const MAX_MESSAGES = 500;
            if (this.messages.length > MAX_MESSAGES) {
                this.messages.splice(0, this.messages.length - MAX_MESSAGES);
            }

            // Freeze completed message displayBlocks and strings to reduce reactive overhead
            if (currentMsg && Array.isArray(currentMsg.displayBlocks)) {
                currentMsg.displayBlocks.forEach(block => {
                    if (!Object.isFrozen(block)) {
                        if (block.type !== 'approval' && !block.data) {
                            Object.freeze(block);
                            if (typeof block.content === 'string') Object.freeze(block.content);
                            if (typeof block.args === 'string') Object.freeze(block.args);
                        }
                    }
                });
            }

            if (this.ttsSettings.enabled && audioProcess) {
                await audioProcess;
            } else {
                // === Generation completion notification when TTS is disabled ===
                if ((this.vrmOnline || this.vtsOnline) && this.ttsWebSocket) {
                    this.sendTTSStatusToVRM('allChunksCompleted', {});
                }
            }


            this.isThinkOpen = false;
            shouldSyncGroupMemory = !!currentMsg?.pure_content?.trim();

            setTimeout(() => {
                if (!this.isSending && this.audioStartTime <= this.audioCtx.currentTime) {
                    this.sendTTSStatusToVRM('allChunksCompleted', {});
                }
            }, 1000);

            if (shouldSyncGroupMemory && latestUserMessage?.id && currentMsg?.id) {
                await this.syncGroupMemoryAfterReply(latestUserMessage, currentMsg);
            }

            this.toolArgsAccumulator = {};
            if (currentMsg?._ttsState) {
                delete currentMsg._ttsState;
            }

            // Clear streaming buffer and typewriter animation
            this._typewriterRunning = false;
            this._typewriterTickCount = 0;
            if (this._typewriterRafId) { cancelAnimationFrame(this._typewriterRafId); this._typewriterRafId = null; }
            this._streamTargetMsg = null;
            this._streamTextBuffer = '';
        }
    },

    // 1. Safely resolve the message sender name
    getMessageAgentName(message) {
        // Use the recorded name if present
        if (message.agentName) return message.agentName;
        
        // For an assistant message without a name, such as a greeting
        if (message.role === 'assistant') {
            // A. Prefer the active character card or memory name
            if (this.memorySettings && this.memorySettings.is_memory && this.memorySettings.selectedMemory) {
                const selectedId = this.memorySettings.selectedMemory;
                const memRecord = this.memories && this.memories.find(m => String(m.id) === String(selectedId));
                if (memRecord) return memRecord.name;
            }
            // B. Otherwise try the default agent name
            if (this.mainAgent === 'super-model') {
                return this.t('defaultAgent');
            } else if (this.agents && this.agents[this.mainAgent]) {
                return this.agents[this.mainAgent].name;
            }
            return 'Assistant';
        }
        
        // For user messages
        return this.memorySettings?.userName || 'User';
    },

    // 2. Safely parse and format timestamps
    formatMessageTime(timestamp, messageId = null) {
        let timeVal = timestamp;
        
        // Try message.id as fallback timestamp
        if (!timeVal && messageId) {
            const idNum = parseFloat(messageId);
            if (!isNaN(idNum) && idNum > 1000000000000) { // Check for a plausible millisecond timestamp
                timeVal = idNum;
            }
        }
        
        if (!timeVal) return ''; 
        
        const msgDate = new Date(timeVal);
        const now = new Date();
        
        // Get midnight today, yesterday and the preceding day for date comparisons
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const oneDayMs = 24 * 60 * 60 * 1000;
        const yesterdayStart = todayStart - oneDayMs;
        const theDayBeforeStart = todayStart - 2 * oneDayMs;
        
        // Compute Monday midnight as the start of the current week
        const currentDayOfWeek = now.getDay(); // 0 (Sunday) through 6 (Saturday)
        const daysSinceMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1; // Convert to an offset with Monday as zero
        const thisMondayStart = todayStart - daysSinceMonday * oneDayMs;
        
        const msgTime = msgDate.getTime();
        
        // Format hour and minute (HH:mm)
        const hours = String(msgDate.getHours()).padStart(2, '0');
        const minutes = String(msgDate.getMinutes()).padStart(2, '0');
        const timeStr = `${hours}:${minutes}`;
        
        // 1. Today: show time only, e.g. 17:26
        if (msgTime >= todayStart) {
            return timeStr;
        }
        
        // 2. Yesterday: use yesterday translation key
        if (msgTime >= yesterdayStart && msgTime < todayStart) {
            return `${this.t('yesterday')} ${timeStr}`;
        }
        
        // 3. Day before yesterday: use theDayBefore translation key
        if (msgTime >= theDayBeforeStart && msgTime < yesterdayStart) {
            return `${this.t('theDayBefore')} ${timeStr}`;
        }
        
        // 4. Other dates this week: use the weekday key and time
        if (msgTime >= thisMondayStart && msgTime < theDayBeforeStart) {
            const weekKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayKey = weekKeys[msgDate.getDay()];
            const dayName = this.t(dayKey);
            return `${dayName} ${timeStr}`;
        }
        
        // 5. Previous weeks: show date and time
        const year = msgDate.getFullYear();
        const month = String(msgDate.getMonth() + 1).padStart(2, '0');
        const day = String(msgDate.getDate()).padStart(2, '0');
        
        // For current-year messages omit the year
        if (year === now.getFullYear()) {
            return `${month}-${day} ${timeStr}`;
        } else {
            // For earlier years include the full year
            return `${year}-${month}-${day} ${timeStr}`;
        }
    },

    // === Human-in-the-loop handling ===
    async processToolApproval(toolCallId, action) {
        const currentMsg = this.messages[this.messages.length - 1];
        if (!currentMsg) return;
        currentMsg.generationFinished = false; 
        const data = this.approvalMap[toolCallId];
        const toolName = data?.tool_name || data?.name || 'Tool';
        const blockId = `approval-${toolCallId}`;

        // Locate approval block and prepare to convert it into a result block
        let targetIdx = -1;
        if (currentMsg.displayBlocks) {
            targetIdx = currentMsg.displayBlocks.findIndex(b => b.id === toolCallId && b.type === 'approval');
            if (targetIdx !== -1) {
                const originalBlock = currentMsg.displayBlocks[targetIdx];
                const updatedBlock = {
                    ...originalBlock,
                    type: 'tool_result',
                    name: action === 'deny' ? this.t('denying') : `${this.t('executing')} ${toolName}...`,
                    content: '',
                    segments: [] 
                };
                
                if (typeof this.$set === 'function') {
                    this.$set(currentMsg.displayBlocks, targetIdx, updatedBlock);
                } else {
                    currentMsg.displayBlocks[targetIdx] = updatedBlock;
                }
            }
        }

        const escapeHtml = (text) => {
            if (!text) return '';
            return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        };

        const feedbackTitle = action === 'deny' ? (this.t('denying') || 'Denying...') : `${this.t('executing') || 'Executing'} ${toolName}...`;
        this.updateUIBlock(currentMsg, blockId, `\n`);

        this.isSending = true; 
        this.isTyping = true;
        const currentController = new AbortController(); 
        this.abortController = currentController; 

        try {
            let resultText = "";
            
            if (action === 'deny') {
                resultText = `User denied the execution of tool '${toolName}'.`;
                
                // Update result content
                if (targetIdx !== -1) {
                    currentMsg.displayBlocks[targetIdx].content = resultText;
                    currentMsg.displayBlocks[targetIdx].type = 'error';
                    currentMsg.displayBlocks[targetIdx].name = this.t('tool_deny');
                }
            } else {
                // 1. Safely extract and normalize arguments
                let toolParams = data?.tool_params || data?.arguments || data?.params || data?.tool_args || {};
                if (typeof toolParams === 'string') {
                    try { toolParams = JSON.parse(toolParams); } catch (e) {}
                }

                // 2. Send HTTP request
                const response = await fetch('/execute_tool_manually', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        tool_name: toolName, 
                        tool_params: toolParams,
                        approval_type: action 
                    }),
                    signal: this.abortController.signal
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Server Error (${response.status}): ${errText}`);
                }

                const contentType = response.headers.get('content-type');

                // 3. Stream rendering for text/event-stream responses
                if (contentType && contentType.includes('event-stream')) {
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';

                    // Replace loading text with the final title
                    if (targetIdx !== -1) {
                        currentMsg.displayBlocks[targetIdx].name = `${toolName} ${this.t('tool_result')}`;
                    }

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });

                        while (buffer.includes('\n\n')) {
                            const eventEndIndex = buffer.indexOf('\n\n');
                            const eventData = buffer.slice(0, eventEndIndex);
                            buffer = buffer.slice(eventEndIndex + 2);

                            if (eventData.startsWith('data: ')) {
                                const jsonStr = eventData.slice(6).trim();
                                try {
                                    const parsed = JSON.parse(jsonStr);
                                    if (parsed.chunk) {
                                        resultText += parsed.chunk;
                                        // Update frontend component reactively as stream arrives
                                        if (targetIdx !== -1) {
                                            currentMsg.displayBlocks[targetIdx].content = resultText;
                                        }
                                        this.requestScrollToBottom();
                                    } else if (parsed.error) {
                                        throw new Error(parsed.error);
                                    }
                                } catch (e) {
                                    console.error("Parse event error:", e);
                                }
                            }
                        }
                    }
                } else {
                    // 4. Handle ordinary single JSON responses
                    const jsonRes = await response.json();
                    resultText = jsonRes.result || JSON.stringify(jsonRes);
                    
                    if (targetIdx !== -1) {
                        currentMsg.displayBlocks[targetIdx].content = resultText;
                        currentMsg.displayBlocks[targetIdx].name = `${toolName} ${this.t('tool_result')}`;
                    }
                }

                // 5. Synchronize result into AI backend_content
                const cleanedForAI = this.truncateForAI(resultText);
                if (currentMsg.backend_content) {
                    for (let i = currentMsg.backend_content.length - 1; i >= 0; i--) {
                        const item = currentMsg.backend_content[i];
                        if (item.role === 'tool' && item.tool_call_id === toolCallId) {
                            item.content = cleanedForAI;
                            break;
                        }
                    }
                } 
            }

            // Update HTML compatibility backup block
            const blockClass = action === 'deny' ? 'type-error' : 'type-result';
            const iconClass = action === 'deny' ? 'fa-xmark' : 'fa-check';
            const finalTitle = action === 'deny' ? this.t('tool_deny') : `${toolName} ${this.t('tool_result')}`;

            const resultHtml = `\n<div class="sap-process-block ${blockClass}" id="${blockId}">
                <div class="sp-header"><i class="fa-solid ${iconClass}"></i> ${escapeHtml(finalTitle)}</div>
                <pre class="sp-content sp-code">${escapeHtml(resultText)}</pre>
            </div>\n`;
            this.updateUIBlock(currentMsg, blockId, resultHtml);

            // 6. Continue AI generation after tool streaming completes
            await this.generateAIResponse(this.mainAgent, currentMsg.agentName, true);

        } catch (e) {
            console.error("Approval flow failed:", e);
            if (typeof showNotification === 'function') {
                showNotification(e.message || "Tool execution failed", 'error');
            }
            if (targetIdx !== -1) {
                currentMsg.displayBlocks[targetIdx].content = `Error: ${e.message}`;
                currentMsg.displayBlocks[targetIdx].type = 'error';
                currentMsg.displayBlocks[targetIdx].name = 'System Error';
            }
            this.isSending = false;
            this.isTyping = false;
        }
    },

    updateUIBlock(msg, blockId, newHtml) {
        const content = msg.content;
        const startTag = `id="${blockId}"`;
        const startSearchIndex = content.indexOf(startTag);
        
        if (startSearchIndex === -1) {
            msg.content += newHtml;
            return;
        }

        const startIndex = content.lastIndexOf('<div', startSearchIndex);
        let endIndex = -1;
        const searchPart = content.substring(startIndex);
        
        if (searchPart.includes('</div></div>')) {
            endIndex = startIndex + searchPart.indexOf('</div></div>') + 12;
        } else if (searchPart.includes('</div>\n')) {
            endIndex = startIndex + searchPart.indexOf('</div>\n') + 7;
        }

        if (startIndex !== -1 && endIndex !== -1) {
            msg.content = content.substring(0, startIndex) + newHtml + content.substring(endIndex);
        } else {
            msg.content += newHtml;
        }
    },


    getVisibleBlocks(msg) {
        if (!msg.displayBlocks || !msg.displayBlocks.length) return [];
        const blocks = msg.displayBlocks;
        return blocks;
    },

    // === Helpers ===

    // Helper: call manual execution endpoint
    async executeToolBackend(name, params, type) {
        try {
            const res = await fetch('/execute_tool_manually', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    tool_name: name, 
                    tool_params: params,
                    approval_type: type 
                })
            });
            
            // Read raw text first
            const rawText = await res.text();
            
            // Return raw error text for unsuccessful HTTP responses without JSON parsing
            if (!res.ok) {
                return `Server Error (${res.status}): ${rawText}`;
            }
            
            // Attempt JSON parsing
            try {
                const json = JSON.parse(rawText);
                return json.result || JSON.stringify(json);
            } catch (jsonErr) {
                // Display original text when JSON parsing fails
                return rawText || `No response from tool execution.`;
            }
        } catch (e) {
            return `System Error: ${e.message}`;
        }
    },
    

    // 1. Truncated tool result display
    truncateDisplayContent(content) {
        if (typeof content !== 'string') return content;
        if (content.length > MAX_DISPLAY_LENGTH) {
            return content.slice(0, MAX_DISPLAY_LENGTH) + '\n... (The result is too long and has been truncated.)';
        }
        return content;
    },

    // 2. Throttled scrolling with requestAnimationFrame
    requestScrollToBottom() {
        if (!this.scrollPending) {
            this.scrollPending = true;
            requestAnimationFrame(() => {
                // Call the original scrollToBottom
                if (typeof this.scrollToBottom === 'function') {
                    this.scrollToBottom();
                }
                this.scrollPending = false;
            });
        }
    },

    // 3. Character-by-character rendering driven by requestAnimationFrame
    _startTypewriterTick() {
        if (this._typewriterRunning) return;
        this._typewriterRunning = true;
        this._tickTypewriter();
    },

    _tickTypewriter() {
        if (!this._typewriterRunning) return;

        const msg = this._streamTargetMsg;
        if (!msg) { this._typewriterRunning = false; return; }

        const buffer = this._streamTextBuffer || '';

        if (buffer.length > 0) {
            const chunk = buffer.slice(0, this._typewriterSpeed);
            this._streamTextBuffer = buffer.slice(this._typewriterSpeed);

            const block = this.getBlockForMsg(msg, 'text');
            if (block) {
                const MAX_TEXT_CONTENT = 150000;
                if (block.content.length < MAX_TEXT_CONTENT) {
                    block.content += chunk;
                } else if (!block.content.endsWith('\n... (Truncated)')) {
                    block.content += '\n... (Truncated)';
                }
                if (msg.pure_content.length < MAX_TEXT_CONTENT) {
                    msg.pure_content += chunk;
                }
                msg.content += chunk;

                this._typewriterTickCount = (this._typewriterTickCount || 0) + 1;
                if (this._typewriterTickCount % 8 === 0 || !this._streamTextBuffer) {
                    block.segments = this.splitMessageContent(block.content);
                    msg.segments = this.splitMessageContent(msg.content);
                }
            }
            this.requestScrollToBottom();
        }

        if (buffer.length > 0 || (this.isTyping && this.isSending)) {
            this._typewriterRafId = requestAnimationFrame(() => this._tickTypewriter());
        } else {
            this._typewriterRunning = false;
        }
    },

    flushStreamTextBuffer() {
        if (!this._streamTargetMsg) return;
        const block = this.getBlockForMsg(this._streamTargetMsg, 'text');
        if (this._streamTextBuffer) {
            if (block) {
                const MAX_TEXT_CONTENT = 150000;
                if (block.content.length < MAX_TEXT_CONTENT) {
                    block.content += this._streamTextBuffer;
                } else if (!block.content.endsWith('\n... (Truncated)')) {
                    block.content += '\n... (Truncated)';
                }
                if (this._streamTargetMsg.pure_content.length < MAX_TEXT_CONTENT) {
                    this._streamTargetMsg.pure_content += this._streamTextBuffer;
                }
                this._streamTargetMsg.content += this._streamTextBuffer;
            }
            this._streamTextBuffer = '';
        }
        if (block) {
            block.segments = this.splitMessageContent(block.content);
            this._streamTargetMsg.segments = this.splitMessageContent(this._streamTargetMsg.content);
        }
        this.requestScrollToBottom();
    },


    // 1. Determine if a display block is active, executing or waiting
    isBlockActive(msg, block, blockIndex) {
        // No active blocks once the whole message is complete
        if (msg.generationFinished) return false;

        // Explicit state detection (preferred for streaming block updates)
        // Use an active marker on the block currently being written, when available
        if (block.active || block.isStreaming || block.status === 'running') {
            return true;
        }

        // Position-based fallback
        // For a single stream, the newest receiving block is the last displayBlocks element
        const blocks = msg.displayBlocks;
        if (!blocks) return false;
        if (blockIndex === blocks.length - 1) return true;

        // Protect tools that finish later than text
        // Text can finish before a tool, pushing the active tool block
        // to the penultimate position where it could incorrectly collapse.
        // For tool_call, tool_result and reasoning blocks,
        // the final block of these types can still be active.
        if (this.isToolBlock(block)) {
            for (let i = blocks.length - 1; i > blockIndex; i--) {
                if (this.isToolBlock(blocks[i])) return false;
            }
            return true;
        }

        return false;
    },

    // 2. Control expanded and collapsed block state consistently
    shouldExpandBlock(msg, block, blockIndex) {
        // 1. Text, approval and error blocks remain expanded for readability
        if (block.type === 'text' || block.type === 'approval' || block.type === 'error') {
            return true;
        }

        // 2. Tool and reasoning blocks expand when active and collapse after completion
        if (this.isToolBlock(block)) {
            return this.isBlockActive(msg, block, blockIndex);
        }

        return true;
    },

    // 3. Identify tool blocks
    isToolBlock(block) {
        return block.type === 'tool_call' || block.type === 'tool_result' || block.type === 'reasoning';
    },

    // Open tool details when a collapsed block is clicked
    openToolBlockDetail(message, block) {
        if (!block || !this.isToolBlock(block)) return;
        
        // Keep the block object and message reference
        this.activeToolBlock = {
            messageIndex: this.messages.indexOf(message),
            blockIndex: message.displayBlocks.indexOf(block), // Preserve original index for later operations
            block: block
        };
        
        this.activeSideView = 'toolDetail';
        if (!this.sidePanelOpen) {
            this.expandSidePanel();
        }
        this.updatePanelWidths();
    },

    // Close tool details
    closeToolBlockDetail() {
        this.activeToolBlock = null;
        this.activeSideView = 'list';  // Return to extension list
    },

    // Choose icon class by block type
    getToolBlockIcon(type) {
        const icons = {
            'tool_call': 'fa-solid fa-wrench',
            'tool_result': 'fa-solid fa-check',
            'error': 'fa-solid fa-xmark',
            'approval': 'fa-solid fa-lock'
        };
        return icons[type] || 'fa-solid fa-file-lines';
    },

    // Format tool block content for newline and quote display
    formatToolBlockContent(block) {
        if (!block) return '';
        if (block.type === 'approval') {
            return JSON.stringify(block.data?.tool_params, null, 2);
        }
        let content = block.type === 'tool_call' ? (block.args || '') : (block.content || '');
        if (typeof content !== 'string') content = JSON.stringify(content, null, 2);
        return content.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    },

    // Get message block of a specified type
    getBlockForMsg(msg, type, id = null, name = null) {
        if (!msg.displayBlocks) msg.displayBlocks = [];
        if (id) {
            const existing = msg.displayBlocks.find(b => b.type === type && b.id === id);
            if (existing) {
                if (name && !existing.name) existing.name = name;
                return existing;
            }
        }
        let last = msg.displayBlocks[msg.displayBlocks.length - 1];
        const canReuse = last && last.type === type && (!id || last.id === id);
        if (canReuse) {
            if (name && !last.name) last.name = name;
            return last;
        }
        const newBlock = { type, id, name, content: '', args: '', data: null, segments: null };
        msg.displayBlocks.push(newBlock);

        // Trim immediately after inserting a block; keep only the last MAX_RENDERED_BLOCKS
        if (msg.displayBlocks.length > MAX_RENDERED_BLOCKS) {
            msg.displayBlocks.splice(0, msg.displayBlocks.length - MAX_RENDERED_BLOCKS);
        }

        return newBlock;
    },

    // Additional method
    smartMergeTerminal(existing, chunk) {
        if (!chunk) return existing;
        
        // Avoid full split scans and O(N^2) memory growth
        if (chunk.includes('\r')) {
            let combined = existing + chunk;
            const lastNewlineIndex = combined.lastIndexOf('\n');
            const previousLines = lastNewlineIndex !== -1 ? combined.substring(0, lastNewlineIndex + 1) : '';
            const lastLine = lastNewlineIndex !== -1 ? combined.substring(lastNewlineIndex + 1) : combined;
            
            const subParts = lastLine.split('\r');
            return previousLines + subParts[subParts.length - 1];
        }
        
        return existing + chunk;
    },

    // Helper: compact output for the model
    truncateForAI(text) {
        if (!text) return '';
        const MAX_LIMIT = 8000; // Maximum characters returned to the model
        
        // 1. Remove progress-bar lines that waste context tokens
        let lines = text.split('\n');
        let cleanedLines = lines.filter(line => {
            // Filter lines resembling progress bars
            const isProgressBar = (line.includes('█') || line.includes('░') || (line.includes('%') && line.includes('|')));
            return !isProgressBar;
        });
        
        let cleanedText = cleanedLines.join('\n').trim();
        
        // 2. If still too long, truncate the middle
        if (cleanedText.length > MAX_LIMIT) {
            return cleanedText.substring(0, 2000) + 
                  `\n\n... [Total ${text.length} chars. Output truncated for context. User sees full output above.] ...\n\n` + 
                  cleanedText.slice(-4000);
        }
        return cleanedText;
    },

    // Helper: escape HTML
    escapeHtml(text) {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
    async handleInputPaste(event) {
      const items = (event.clipboardData || window.clipboardData).items;
      
      // Character threshold for converting text to a file
      const TEXT_TO_FILE_THRESHOLD = 2000; 

      const imageFiles = []; // Images to upload
      const videoFiles = []; // Videos to upload
      const docFiles = [];   // Documents to upload
      let hasValidContent = false;

      // 1. Iterate clipboard items
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (!file) continue;

          const ext = (file.name.split('.').pop() || '').toLowerCase();
          const isImageMime = item.type.startsWith('image/');
          const isVideoMime = item.type.startsWith('video/'); // Detect video MIME type

          // --- Video handling ---
          if (isVideoMime || ALLOWED_VIDEO_EXTENSIONS.includes(ext)) {
            videoFiles.push(file);
            hasValidContent = true;
          } 
          // --- Image handling ---
          else if (isImageMime || ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
            if (file.name === 'image.png' || !file.name.includes('.')) {
              const fileExtension = file.type.split('/')[1] || 'png';
              const namedFile = new File([file], `pasted_image_${Date.now()}.${fileExtension}`, { type: file.type });
              imageFiles.push(namedFile);
            } else {
              imageFiles.push(file);
            }
            hasValidContent = true;
          } 
          // --- Document handling ---
          else if (ALLOWED_EXTENSIONS.includes(ext)) {
            docFiles.push(file);
            hasValidContent = true;
          }
        }
      }

      // 2. If no actual file is detected, check text length
      if (!hasValidContent) {
          const pastedText = event.clipboardData.getData('text');
          if (pastedText && pastedText.length > TEXT_TO_FILE_THRESHOLD) {
              const fileName = `paste_text_${Date.now()}.txt`;
              const textFile = new File([pastedText], fileName, { type: 'text/plain' });
              docFiles.push(textFile);
              hasValidContent = true;
          }
      }

      // 3. If valid content was found
      if (hasValidContent) {
        event.preventDefault();

        // Handle video
        if (videoFiles.length > 0) {
          this.addFiles(videoFiles, 'video');
        }

        if (imageFiles.length > 0) {
          this.addFiles(imageFiles, 'image');
        }

        if (docFiles.length > 0) {
          this.addFiles(docFiles, 'file');
        }
      }
    },
    getRoleAvatar(name) {
        // Look in memory list
        const mem = this.memories.find(m => m.name === name);
        if (mem && mem.avatar) return mem.avatar;
        // Optionally check agent avatars
        // const agentKey = Object.keys(this.agents).find(key => this.agents[key].name === name);
        // if (agentKey && this.agents[agentKey].avatar) return this.agents[agentKey].avatar;
        
        return 'source/Avatar.png';
    },

    async playPCMChunk(b64, currentText = '', message = null) {
        this.isOmniPlaying = true;
        if (message) {
            message.isPlaying = true;
            if (message.omniDuration === undefined) message.omniDuration = 0;
            if (message.omniCurrentTime === undefined) message.omniCurrentTime = 0;
            if (!message.generationFinished) message.omniAudioChunks.push(b64);
        }

        try {
            if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();

            // Decode data
            const raw = atob(b64);
            const pcm16 = new Int16Array(raw.length / 2);
            for (let i = 0; i < raw.length; i += 2) {
                pcm16[i >> 1] = raw.charCodeAt(i) | (raw.charCodeAt(i + 1) << 8);
            }

            const sampleRate = 24000;
            const buf = this.audioCtx.createBuffer(1, pcm16.length, sampleRate);
            const floatData = buf.getChannelData(0);
            for (let i = 0; i < pcm16.length; i++) floatData[i] = pcm16[i] / 32768;

            const chunkDuration = buf.duration;
            if (message && message.isOmni && !message.generationFinished) {
                message.omniDuration += chunkDuration;
            }

            // ======= Synchronize binary data to VRM =======
            if ((this.vrmOnline || this.vtsOnline) && this.ttsWebSocket) {
                const pcmUint8 = new Uint8Array(raw.length);
                for(let i=0; i<raw.length; i++) pcmUint8[i] = raw.charCodeAt(i);
                
                this.sendBinaryToVRM({
                    type: 'omni_chunk',
                    text: currentText, // Pass current text
                    sampleRate: sampleRate
                }, pcmUint8.buffer);
            }
            // ===============================================

            const now = this.audioCtx.currentTime;
            if (this.audioStartTime < now) this.audioStartTime = now;

            const src = this.audioCtx.createBufferSource();
            src.buffer = buf;
            if (!this.activeSources) this.activeSources = [];
            this.activeSources.push(src);

            const gainNode = this.audioCtx.createGain();
            gainNode.gain.value = this.vrmOnline ? 0.000001 : 1.0;

            src.connect(gainNode);
            gainNode.connect(this.audioCtx.destination);

            src.onended = () => {
                if (this.activeSources) this.activeSources = this.activeSources.filter(s => s !== src);
                if (message && message.isOmni && !src.isForceStopped) {
                    message.omniCurrentTime += chunkDuration;
                    if (message.omniCurrentTime > message.omniDuration) message.omniCurrentTime = message.omniDuration;

                    if (message.generationFinished && this.activeSources.length === 0) {
                        message.isPlaying = false;
                        message.omniCurrentTime = message.omniDuration;
                        if (this.vrmOnline || this.vtsOnline) this.sendTTSStatusToVRM('allChunksCompleted', {});
                        this.isOmniPlaying = false;
                    }
                }
                try { src.disconnect(); gainNode.disconnect(); } catch (e) {}
            };

            src.start(this.audioStartTime);
            this.audioStartTime += buf.duration;
        } catch (error) {
            console.error('Error in playPCMChunk:', error);
            if (message) message.isPlaying = false;
        }
    },
    // --- [4] Binary packet helper ---
    sendBinaryToVRM(metadata, audioArrayBuffer) {
        if (!this.ttsWebSocket || this.ttsWebSocket.readyState !== WebSocket.OPEN) return;
        const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
        const totalBuffer = new Uint8Array(4 + metadataBytes.byteLength + audioArrayBuffer.byteLength);
        const view = new DataView(totalBuffer.buffer);
        view.setUint32(0, metadataBytes.byteLength, true); // JSON length
        totalBuffer.set(metadataBytes, 4);
        totalBuffer.set(new Uint8Array(audioArrayBuffer), 4 + metadataBytes.byteLength);
        this.ttsWebSocket.send(totalBuffer);
    },

    async translateMessage(index) {
      const msg = this.messages[index];
      const originalContent = msg.content;
      if (msg.isTranslating) return;
      if (originalContent.trim() === '') return;

      // 1. Reserve a slot
      this.messages[index] = {
        ...msg,
        content: this.t('translating') + '...',
        isTranslating: true,
        originalContent
      };

      try {
        const abortController = new AbortController();
        this.abortController = abortController;

        // 2. Assemble TTS instructions
        let newttsList = [];
        if (this.ttsSettings?.newtts) {
          for (const key in this.ttsSettings.newtts) {
            if (this.ttsSettings.newtts[key].enabled) newttsList.push(key);
          }
        }
        const ttsMsg = (newttsList.length === 0 || !this.ttsSettings?.enabled)
          ? 'If the source text is already in the target language, return it unchanged.'
          : `While translating, add the appropriate voice tags. If the text is already in the target language, add only the appropriate voice tags. Do not use HTML comments because they hide text. Available voices:\n${newttsList.join(', ')}\nWrap narration or character dialogue in <VoiceName></VoiceName> to select the corresponding TTS voice. Leave portions with no matching voice untagged. Non-English voice names work too. If the character you play has a voice in the list, tag that character's spoken dialogue with that voice. Treat all non-dialogue as narration. Place voice tags around spoken dialogue. Example: <Narrator>It was three in the afternoon. She said:</Narrator><Character>\"What lovely weather!\"</Character><Narrator>She stretched.</Narrator>\n\n`;

        // 3. Start streaming request
        const response = await fetch('/simple_chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.mainAgent,
            messages: [
              {
                role: 'system',
                content: `You are a professional translator. Translate the user's content strictly into ${this.target_lang}, preserving formatting such as Markdown and line breaks. Add no extra content. Return only the translation.${ttsMsg}`
              },
              {
                role: 'user',
                content: `Translate the following content into ${this.target_lang}:\n\n${originalContent}`
              }
            ],
            stream: true,
            temperature: 0.1
          }),
          signal: abortController.signal
        });

        if (!response.ok) {
          let errMsg = 'Translation failed';
          try {
            const errData = await response.json();
            errMsg = errData?.error?.message || errMsg;
          } catch (e) {}
          throw new Error(errMsg);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';      // Residual partial line
        let translated = '';  // Accumulated translation

        // 4. Read chunks
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep the potentially incomplete last line for the next iteration

          for (const line of lines) {
            if (!line) continue;          // Skip blank lines
            try {
              const chunk = JSON.parse(line);
              const delta = chunk.choices?.[0]?.delta?.content ?? '';
              if (delta) {
                translated += delta;
                this.messages[index].content = translated; // Render incrementally
              }
            } catch (e) {
              // Ignore parse failures
            }
          }
        }

        // 5. Translation complete
        this.messages[index].isTranslating = false;
        this.messages[index].translated = true;

      } catch (error) {
        if (error.name === 'AbortError') {
          // Restore original text on user interruption
          this.messages[index] = { ...msg, content: originalContent, isTranslating: false };
        } else {
          this.messages[index].content = `Translation error: ${error.message}`;
          this.messages[index].isTranslating = false;
        }
      } finally {
        this.abortController = null;
      }
    },
    stopGenerate() {
      this._typewriterRunning = false;
      this._typewriterTickCount = 0;
      if (this._extSendTimer) { clearTimeout(this._extSendTimer); this._extSendTimer = null; this._extSendPending = false; }
      if (this._typewriterRafId) { cancelAnimationFrame(this._typewriterRafId); this._typewriterRafId = null; }
      if (this.abortController) {
        this.abortController.abort();
      }
      this.isThinkOpen = false;
      this.isSending = false;
      this.isTyping = false;
      this.abortController = null;
      if(this.settings.enableOmniTTS){
        if (this.activeSources && this.activeSources.length > 0) {
          this.activeSources.forEach(src => {
            try {
              src.stop(); // Stop playback immediately
            } catch (e) {
              // Ignore errors from already stopped or unstarted sources
            }
          });
          // Clear array
          this.activeSources = [];
        }
        this.audioStartTime = 0; 
        this.stopAllAudioPlayback();
      }
    },
    async autoSaveSettings() {
      if (this.isElectron) {
        await window.electronAPI.saveChromeSettings(JSON.parse(JSON.stringify(this.chromeMCPSettings)));
      }
      return new Promise((resolve, reject) => {
        this.ensureConversationGroups();
        
        // Strip embedded Base64 blobs from file objects, retaining paths for restoration
        const cleanFiles = (files) => (files || []).map(f => ({ name: f.name, path: f.path, type: f.type, detectedType: f.detectedType }));

        const payload = {
          ...this.settings,
          showHistorySidebar: this.showHistorySidebar,
          system_prompt: this.system_prompt,
          SystemPromptsList: this.SystemPromptsList,
          agents: this.agents,
          mainAgent: this.mainAgent,
          discordBotConfig: this.discordBotConfig,
          slackBotConfig: this.slackBotConfig,
          telegramBotConfig: this.telegramBotConfig,
          targetLangSelected: this.targetLangSelected,
          allBriefly: this.allBriefly,
          isForceScrollToBottom: this.isForceScrollToBottom,
          BotConfig: this.BotConfig,
          liveConfig: this.liveConfig,
          stickerPacks: this.stickerPacks,
          tools: this.toolsSettings,
          llmTools: this.llmTools,
          conversationId: this.conversationId,
          conversationGroups: this.conversationGroups,
          reasoner: this.reasonerSettings,
          fast: this.fastSettings,
          isBtnCollapse: this.isBtnCollapse,
          vision: this.visionSettings,
          webSearch: this.webSearchSettings, 
          codeSettings: this.codeSettings,
          CLISettings: this.CLISettings,
          acpSettings: this.acpSettings,
          visionControlSettings: this.visionControlSettings,
          loveSettings: this.loveSettings,
          diarySettings: this.diarySettings,
          ccSettings: this.ccSettings,
          qcSettings: this.qcSettings,
          dsSettings: this.dsSettings,
          localEnvSettings: this.localEnvSettings,
          wslSettings: this.wslSettings,
          ocSettings: this.ocSettings,
          HASettings: this.HASettings,
          chromeMCPSettings: this.chromeMCPSettings,
          localAppControlSettings: this.localAppControlSettings,
          sqlSettings: this.sqlSettings,
          KBSettings: this.KBSettings,
          textFiles: cleanFiles(this.textFiles),
          imageFiles: cleanFiles(this.imageFiles),
          videoFiles: cleanFiles(this.videoFiles),
          knowledgeBases: this.knowledgeBases,
          modelProviders: this.modelProviders,
          systemSettings: this.systemSettings,
          largeMoreButtonDict: this.largeMoreButtonDict,
          smallMoreButtonDict: this.smallMoreButtonDict,
          currentLanguage: this.currentLanguage,
          mcpServers: this.mcpServers,
          a2aServers: this.a2aServers,
          isdocker: this.isdocker,
          memories: this.memories,
          memorySettings: this.memorySettings,
          text2imgSettings: this.text2imgSettings,
          asrSettings: this.asrSettings,
          ttsSettings: this.ttsSettings,
          behaviorSettings: this.behaviorSettings,
          VRMConfig: this.VRMConfig,
          THAConfig: this.THAConfig,
          SoulxConfig: this.SoulxConfig,
          comfyuiServers: this.comfyuiServers,
          comfyuiAPIkey: this.comfyuiAPIkey,
          workflows: this.workflows,
          custom_http: this.customHttpTools,
          showBrowserChat: this.showBrowserChat,
          searchEngine: this.searchEngine,
          isGroupMode: this.isGroupMode,
          selectedGroupAgents: this.selectedGroupAgents,
        };
        const correlationId = uuid.v4();
        
        try {
            const jsonStr = JSON.stringify({
                type: 'save_settings',
                data: payload,
                correlationId: correlationId
            });
            this.ws.send(jsonStr);
        } catch (e) {
            console.error("Payload serialization failed; prevented renderer crash:", e);
            reject(e);
            return;
        }

        const handler = (event) => {
          const response = JSON.parse(event.data);
          if (response.type === 'settings_saved' && response.correlationId === correlationId) {
            this.ws.removeEventListener('message', handler);
            resolve();
          }
          if (response.type === 'save_error') {
            this.ws.removeEventListener('message', handler);
            reject(new Error('Save failed'));
          }
        };
        const timeout = setTimeout(() => {
          this.ws.removeEventListener('message', handler);
          reject(new Error('Save timed out'));
        }, 10000);
        this.ws.addEventListener('message', handler);
      });
    },

    getSanitizedConversations() {
      // Map into a new array without changing in-memory data
      return this.conversations.map(conv => ({
        ...conv,
        // Clean message list
        messages: conv.messages.map(msg => {
          // Destructure to exclude large or temporary properties
          const {
            audioChunks,      // Ordinary TTS audio blob URLs
            omniAudioChunks,  // Large PCM-stream Base64 arrays
            ttsQueue,         // Runtime Set queue
            isPlaying,        // Playback state
            cur_audioDatas,   // Temporary Base64 data
            ...rest           // Retain role, content, pure_content, timestamp, fileLinks, etc.
          } = msg;

          // Return a clean message object
          return {
            ...rest,
            // Explicitly clear these fields to avoid stale data
            audioChunks: [],
            omniAudioChunks: [],
            currentChunk: 0,
            omniCurrentTime: 0,
            isPlaying: false
          };
        })
      }));
    },

    async saveConversations() {
      return new Promise((resolve, reject) => {
        const sanitizedConversations = this.getSanitizedConversations();

        const payload = {
          conversations: sanitizedConversations,
          conversationGroups: this.conversationGroups
        };
        const correlationId = uuid.v4();
        
        try {
            const jsonStr = JSON.stringify({
                type: 'save_conversations',
                data: payload,
                correlationId: correlationId
            });
            this.ws.send(jsonStr);
        } catch (e) {
            console.error("Conversation serialization failed; prevented renderer crash:", e);
            reject(e);
            return;
        }

        const handler = (event) => {
          const response = JSON.parse(event.data);
          if (response.type === 'conversations_saved' && response.correlationId === correlationId) {
            this.ws.removeEventListener('message', handler);
            resolve();
          }
          if (response.type === 'save_error') {
            this.ws.removeEventListener('message', handler);
            reject(new Error('Save failed'));
          }
        };
        const timeout = setTimeout(() => {
          this.ws.removeEventListener('message', handler);
          reject(new Error('Save timed out'));
        }, 10000);
        this.ws.addEventListener('message', handler);
      });
    },

    getSanitizedConversation(conv) {
      return {
        ...conv,
        messages: conv.messages.map(msg => {
          const {
            audioChunks, omniAudioChunks, ttsQueue, isPlaying, cur_audioDatas, ...rest
          } = msg;
          return { ...rest, audioChunks: [], omniAudioChunks: [], currentChunk: 0, omniCurrentTime: 0, isPlaying: false };
        })
      };
    },

    saveCurrentConversation() {
      if (!this.conversationId || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      try {
        const conv = this.conversations.find(c => c.id === this.conversationId);
        if (!conv) return;
        const sanitized = this.getSanitizedConversation(conv);
        const jsonStr = JSON.stringify({
          type: 'save_current_conversation',
          data: { conversationId: this.conversationId, conversation: sanitized },
          correlationId: uuid.v4()
        });
        this.ws.send(jsonStr);
      } catch (e) {
        console.error("Incremental conversation save failed:", e);
      }
    },

    // fetchModels implementation
    async fetchModels() {
      this.modelsLoading = true;
      try {
        const response = await fetch(`/v1/models`);
        const result = await response.json();
        
        // Extract nested data
        const { data } = result;
        
        this.models = data.map(item => ({
          id: item.id,
          created: new Date(item.created * 1000).toLocaleDateString(),
        }));
        
      } catch (error) {
        console.error('Failed to retrieve model data:', error);
        this.modelsError = error.message;
        this.models = []; // Clear data on failure
      } finally {
        this.modelsLoading = false;
      }
    },

    // copyEndpoint implementation
    copyEndpoint() {
      navigator.clipboard.writeText(`${this.partyURL}/v1`)
        .then(() => {
          showNotification(this.t('copy_success'), 'success');
        })
        .catch(() => {
          showNotification(this.t('copy_fail'), 'error');
        });
    },

    copyMCPEndpoint(){
      navigator.clipboard.writeText(`${this.partyURL}/mcp`)
        .then(() => {
          showNotification(this.t('copy_success'), 'success');
        })
        .catch(() => {
          showNotification(this.t('copy_fail'), 'error');
        });
    },
    copyVrmEndpoint(){
      navigator.clipboard.writeText(`${this.partyURL}/vrm.html`)
        .then(() => {
          showNotification(this.t('copy_success'), 'success');
        })
        .catch(() => {
          showNotification(this.t('copy_fail'), 'error');
        });
    },
    copyTHAEndpoint(){
      navigator.clipboard.writeText(`${this.partyURL}/tha.html`)
        .then(() => {
          showNotification(this.t('copy_success'), 'success');
        })
        .catch(() => {
          showNotification(this.t('copy_fail'), 'error');
        });
    },
    copyURL(url) {
      navigator.clipboard.writeText(url)
        .then(() => {
          showNotification(this.t('copy_success'), 'success');
        })
        .catch(() => {
          showNotification(this.t('copy_fail'), 'error');
        });
    },
    copyModel() {
      navigator.clipboard.writeText('super-model')
        .then(() => {
          showNotification(this.t('copy_success'));
        })
        .catch(() => {
          showNotification(this.t('copy_fail'), 'error');
        });
    },

    toggleSection(section) {
      this.expandedSections[section] = !this.expandedSections[section]
      this.autoSaveSettings()
    },
    
    // Header click handler
    handleHeaderClick(section) {
      this.toggleSection(section)
    },
    async clearMessages(groupId = null) {
      this.stopGenerate();
      const targetGroupId = groupId || this.activeConversationGroupId || this.draftConversationGroupId || 'default';
      this.activeConversationGroupId = targetGroupId;
      this.draftConversationGroupId = targetGroupId;
      if (this.system_prompt){
        this.messages = [{ role: 'system', content: this.system_prompt }];
      } else {
        this.messages = [{ role: 'system', content: ' ' }];
      }
      this.conversationId = null;
      this.fileLinks = [];
      this.isThinkOpen = false; // Reset thinking-mode state
      this.asyncToolsID = [];
      this.inAutoMode = false; // Reset automatic mode state
      this.randomGreetings(); // Regenerate random greetings
      this.requestScrollToBottom();    // Trigger UI refresh
      this.autoSaveSettings();
      this.sendMessagesToExtension(); // Send messages to extensions
    },


  async browseAllFiles() {
    if (!this.isElectron) {
      // Browser environment
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = true
      // Combine accepted file types
      input.accept = ALL_ALLOWED_EXTENSIONS.map(ext => `.${ext}`).join(',')
      
      input.onchange = (e) => {
        const files = Array.from(e.target.files)
        // Validate against the combined allowlist
        const validFiles = files.filter(file => {
          const ext = file.name.split('.').pop()?.toLowerCase();
          return ALL_ALLOWED_EXTENSIONS.includes(ext);
        })
        this.handleFiles(validFiles)
      }
      input.click()
    } else {
      // Electron environment
      // openFileDialog is expected to return multiple selected paths
      const result = await window.electronAPI.openFileDialog(); 
      if (!result.canceled) {
        const files = await Promise.all(
          result.filePaths
            .filter(path => {
              const ext = path.split('.').pop()?.toLowerCase() || '';
              return ALL_ALLOWED_EXTENSIONS.includes(ext);
            })
            .map(async path => {
              const buffer = await window.electronAPI.readFile(path);
              const blob = new Blob([buffer]);
              return new File([blob], path.split(/[\\/]/).pop());
            })
        );
        this.handleFiles(files);
      }
    }
  },

    async sendFiles() {
      this.showUploadDialog = true;
      // Set up file upload handling
      this.currentUploadType = 'file';
    },
    async sendImages() {
      this.showUploadDialog = true;
      // Set up image upload handling
      this.currentUploadType = 'image';
    },
    browseFiles() {
      if (this.currentUploadType === 'image') {
        this.browseImages();
      } else {
        this.browseDocuments();
      }
    },
    
    // Handle image selection
    async browseImages() {
      if (!this.isElectron) {
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = true
        input.accept = ALLOWED_IMAGE_EXTENSIONS.map(ext => `.${ext}`).join(',')
        
        input.onchange = (e) => {
          const files = Array.from(e.target.files)
          const validFiles = files.filter(this.isValidImageType)
          this.handleFiles(validFiles)
        }
        input.click()
      } else {
        const result = await window.electronAPI.openImageDialog();
        if (!result.canceled) {
          // Convert Electron paths into File objects
          const files = await Promise.all(
            result.filePaths
              .filter(path => {
                const ext = path.split('.').pop()?.toLowerCase() || '';
                return ALLOWED_IMAGE_EXTENSIONS.includes(ext);
              })
              .map(async path => {
                // Read file content and convert to File
                const buffer = await window.electronAPI.readFile(path);
                const blob = new Blob([buffer]);
                return new File([blob], path.split(/[\\/]/).pop());
              })
          );
          this.handleFiles(files);
        }
      }
    },

    // File selection handler
    async browseDocuments() {
      if (!this.isElectron) {
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = true
        input.accept = ALLOWED_EXTENSIONS.map(ext => `.${ext}`).join(',')
        
        input.onchange = (e) => {
          const files = Array.from(e.target.files)
          const validFiles = files.filter(this.isValidFileType)
          this.handleFiles(validFiles)
        }
        input.click()
      } else {
        const result = await window.electronAPI.openFileDialog();
        if (!result.canceled) {
          // Convert Electron paths into File objects
          const files = await Promise.all(
            result.filePaths
              .filter(path => {
                const ext = path.split('.').pop()?.toLowerCase() || '';
                return ALLOWED_EXTENSIONS.includes(ext);
              })
              .map(async path => {
                // Read file content and convert to File
                const buffer = await window.electronAPI.readFile(path);
                const blob = new Blob([buffer]);
                return new File([blob], path.split(/[\\/]/).pop());
              })
          );
          this.handleFiles(files);
        }
      }
    },
    // File selection handler
    async browseReadFiles() {
      if (!this.isElectron) {
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = true
        input.accept = ALLOWED_EXTENSIONS.map(ext => `.${ext}`).join(',')
        
        input.onchange = (e) => {
          const files = Array.from(e.target.files)
          const validFiles = files.filter(this.isValidFileType)
          this.handleReadFiles(validFiles)
        }
        input.click()
      } else {
        const result = await window.electronAPI.openFileDialog();
        if (!result.canceled) {
          // Convert Electron paths into File objects
          const files = await Promise.all(
            result.filePaths
              .filter(path => {
                const ext = path.split('.').pop()?.toLowerCase() || '';
                return ALLOWED_EXTENSIONS.includes(ext);
              })
              .map(async path => {
                // Read file content and convert to File
                const buffer = await window.electronAPI.readFile(path);
                const blob = new Blob([buffer]);
                return new File([blob], path.split(/[\\/]/).pop());
              })
          );
          this.handleReadFiles(files);
        }
      }
    },

    // File validation
    isValidFileType(file) {
      if (this.currentUploadType === 'image') {
        return this.isValidImageType(file);
      }
      const ext = (file.name.split('.').pop() || '').toLowerCase()
      return ALLOWED_EXTENSIONS.includes(ext) || MIME_WHITELIST.some(mime => file.type.includes(mime))
    },
    isValidImageType(file) {
      const ext = (file.name.split('.').pop() || '').toLowerCase()
      return ALLOWED_IMAGE_EXTENSIONS.includes(ext) || IMAGE_MIME_WHITELIST.some(mime => file.type.includes(mime))
    },

  // Drop handler
  async handleInputDrop(event) {
    this.isDragging = false;
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      await this.handleFiles(files);
    }
  },

  // Paste handler, including pasted screenshots
  handleInputPaste(event) {
    const items = event.clipboardData.items;
    const files = [];
    let hasFiles = false;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        files.push(items[i].getAsFile());
        hasFiles = true;
      }
    }
    
    if (hasFiles) {
      // Prevent default behavior when files are present
      event.preventDefault();
      this.handleFiles(files);
    }
    // Otherwise let the browser paste text normally
  },


    // Shared file handling
    async handleFiles(files) {
      // 1. Combine allowed extensions for initial filtering
      const allAllowed = [...ALLOWED_VIDEO_EXTENSIONS, ...ALLOWED_IMAGE_EXTENSIONS, ...ALLOWED_EXTENSIONS];
      
      // 2. Process each selected file
      files.forEach(file => {
        try {
          const filename = file.name || (file.path && file.path.split(/[\\/]/).pop()) || '';
          const ext = filename.split('.').pop()?.toLowerCase() || '';

          // Check allowlist
          if (ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
            // Handle images
            this.addFiles([file], 'image');
          } else if (ALLOWED_VIDEO_EXTENSIONS.includes(ext)) {
            // Handle documents
            this.addFiles([file], 'video');
          } else if (ALLOWED_EXTENSIONS.includes(ext)) {
            // Handle files
            this.addFiles([file], 'file');
          } else {
            // Unsupported type
            console.warn("Unsupported file type: " + ext);
            // Optionally call this.showErrorAlert('file');
          }
        } catch (e) {
          console.error('File classification failed:', e);
        }
      });
    },
    // Shared file handling
    async handleReadFiles(files) {
      this.showFileDialog = false;
      const allowedExtensions = this.currentUploadType === 'image' ? ALLOWED_IMAGE_EXTENSIONS : ALLOWED_EXTENSIONS;

      const validFiles = files.filter(file => {
        try {
          // Safely extract extension
          const filename = file.name || (file.path && file.path.split(/[\\/]/).pop()) || '';
          const ext = filename.split('.').pop()?.toLowerCase() || '';
          return allowedExtensions.includes(ext);
        } catch (e) {
          console.error('File processing failed:', e);
          return false;
        }
      });

      if (validFiles.length > 0) {
        const formData = new FormData();

        for (const file of validFiles) {
          formData.append('files', file, file.name);
        }

        try {
          console.log('Uploading files...');
          const response = await fetch(`/load_file`, {
            method: 'POST',
            body: formData
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Server responded with an error:', errorText);
            showNotification(this.t('file_upload_failed'), 'error');
            return;
          }

          const data = await response.json();
          if (data.success) {      
            // Add new file metadata to this.textFiles
            this.textFiles = [...data.textFiles,...this.textFiles];
            this.selectedFile = data.textFiles[0].unique_filename;
            this.autoSaveSettings();
            this.parseSelectedFile();
          } else {
            showNotification(this.t('file_upload_failed'), 'error');
          }
        } catch (error) {
          console.error('Error during file upload:', error);
          showNotification(this.t('file_upload_failed'), 'error');
        }
      } else {
        this.showErrorAlert(this.currentUploadType);
      }
    },
    clearLongText() {
      this.selectedFile = null;
      this.readConfig.longTextList = [];
      this.longTextListIndex = 0;
      this.readConfig.longText = '';
    },
    removeItem(index, type) {
      if (type === 'file') {
        this.files.splice(index, 1);
      } else {
        // Remove images from the image list, considering this.files.length
        index = index - this.files.length;
        this.images.splice(index, 1);
      }
    },
    // Error notification
    showErrorAlert(type = 'file') {
      const fileTypes = {
        file: this.t('file_type_error'),
        image: this.t('image_type_error')
      };
      showNotification(fileTypes[type], 'error');
    },
    // Drop handling
    handleDrop(event) {
      event.preventDefault()
      const files = Array.from(event.dataTransfer.files)
        .filter(this.isValidFileType)
      this.handleFiles(files)
    },
        // Drop handling
    handleReadDrop(event) {
      event.preventDefault()
      const files = Array.from(event.dataTransfer.files)
        .filter(this.isValidFileType)
      this.handleReadFiles(files)
    },
    switchToApiBox() {
      // Open API key storage
      this.activeMenu = 'model-config';
      this.subMenu = 'service';
    },

    // Add file to list
    addFiles(files, type = 'file') {
      // Choose display array; images and videos use this.images for preview
      const targetArray = type === 'image' || type === 'video' ? this.images : this.files;

      const newFiles = files.map(file => {
        // Determine exact media type
        let detectedType = type; 

        return {
          path: URL.createObjectURL(file),
          name: file.name,
          file: file,
          detectedType: detectedType // Store video, image or file type
        };
      });

      targetArray.push(...newFiles);
      this.showUploadDialog = false;
    },
    highlightCode() {
      this.$nextTick(() => {
        document.querySelectorAll('pre code').forEach(block => {
          hljs.highlightElement(block);
        });
        this.initCopyButtons();
      });
    },
    async addProvider() {
      this.modelProviders.push({
        id: Date.now(),
        vendor: this.newProviderTemp.vendor,
        url: this.newProviderTemp.url,
        apiKey: '',
        modelId: '',
        isNew: true
      });
      this.newProviderTemp = { vendor: '', url: '', apiKey: '', modelId: '' };
      await this.autoSaveSettings();
    },
    async fetchModelsForProvider(provider) {
      try {
        console.log('Fetching models for provider:', provider.vendor);
        const response = await fetch(`/v1/providers/models`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: provider.url,
            api_key: provider.apiKey,
            vendor: provider.vendor
          })
        });
        if (!response.ok) {
          throw new Error('Failed to fetch models');
        }
        const data = await response.json();
        provider.models = data.data;
        showNotification(this.t('fetch_models_success'));
      } catch (error) {
        showNotification(this.t('fetch_models_failed'), 'error');
      }
    },
    async testAndFetchModels() {
      if (!this.newProviderTemp.url || !this.newProviderTemp.apiKey) {
        showNotification(this.t('enterUrlAndKey'), 'warning');
        return;
      }
      this.newProviderTemp.connectionStatus = 'testing';
      this.newProviderTemp.modelsLoading = true;
      this.newProviderTemp.models = [];
      try {
        const response = await fetch(`/v1/providers/models`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: this.newProviderTemp.url,
            api_key: this.newProviderTemp.apiKey,
            vendor: this.newProviderTemp.vendor
          })
        });
        if (!response.ok) throw new Error('Connection failed');
        const data = await response.json();
        this.newProviderTemp.models = data.data || [];
        this.newProviderTemp.connectionStatus = 'success';
        this.newProviderTemp.modelsLoading = false;
      } catch (error) {
        this.newProviderTemp.connectionStatus = 'failed';
        this.newProviderTemp.modelsLoading = false;
        this.newProviderTemp.models = [];
      }
    },
    // removeProvider implementation
    async removeProvider(index) {
      // Get deleted provider details
      const removedProvider = this.modelProviders[index];
      
      // Remove from provider list
      this.modelProviders.splice(index, 1);

      // Clear references in related settings
      const providerId = removedProvider.id;
      
      // Clear main model configuration
      if (this.settings.selectedProvider === providerId) {
        this.settings.selectedProvider = null;
        this.settings.model = '';
        this.settings.base_url = '';
        this.settings.api_key = '';
      }

      // Clear reasoning model configuration
      if (this.reasonerSettings.selectedProvider === providerId) {
        this.reasonerSettings.selectedProvider = null;
        this.reasonerSettings.model = '';
        this.reasonerSettings.base_url = '';
        this.reasonerSettings.api_key = '';
      }

      // Trigger autosave
      await this.autoSaveSettings();
    },
    confirmAddProvider() {
      if (!this.newProviderTemp.vendor) {
        showNotification(this.t('vendor_required'), 'warning')
        return
      }
      
      const newProvider = {
        id: Date.now(),
        vendor: this.newProviderTemp.vendor,
        url: this.newProviderTemp.url,
        apiKey: this.newProviderTemp.apiKey || '',
        modelId: this.newProviderTemp.models.length > 0 ? this.newProviderTemp.models[0] : (this.newProviderTemp.modelId || ''),
        models: this.newProviderTemp.models || []
      }
      
      this.modelProviders.push(newProvider)
      this.showAddDialog = false
      this.newProviderTemp = { vendor: '', url: '', apiKey: '', modelId: '', models: [], modelsLoading: false, connectionStatus: null }
      this.autoSaveSettings()
    },
    handleVendorChange(value) {
      const defaultUrls = {
        'OpenAI': 'https://api.openai.com/v1',
        'Ollama': this.isdocker ? 'http://host.docker.internal:11434/v1' : 'http://127.0.0.1:11434/v1',
        'Vllm': this.isdocker ? 'http://host.docker.internal:8000/v1' :'http://127.0.0.1:8000/v1',
        'LMstudio': this.isdocker ? 'http://host.docker.internal:1234/v1' :'http://127.0.0.1:1234/v1',
        'xinference': this.isdocker ? 'http://host.docker.internal:9997/v1' :'http://127.0.0.1:9997/v1',
        'Dify': this.isdocker ? 'http://host.docker.internal/v1' :'http://127.0.0.1/v1',
        'newapi': this.isdocker ? 'http://host.docker.internal:3000/v1' : 'http://127.0.0.1:3000/v1',
        'LocalAI': this.isdocker ? 'http://host.docker.internal:8080/v1' : 'http://127.0.0.1:8080/v1',
        'ttswebui': this.isdocker ? 'http://host.docker.internal:7778/v1' : 'http://127.0.0.1:7778/v1',
        'SGLang': this.isdocker ? 'http://host.docker.internal:3000/v1' : 'http://127.0.0.1:3000/v1', 
        'llama.cpp': this.isdocker ? 'http://host.docker.internal:8080/v1' : 'http://127.0.0.1:8080/v1',
        'Gemini': 'https://generativelanguage.googleapis.com',
        'Anthropic': 'https://api.anthropic.com/v1',
        'Grok': 'https://api.groq.com/openai/v1',
        'mistral': 'https://api.mistral.ai/v1',
        'Github': 'https://models.github.ai/inference',
        'openrouter': 'https://openrouter.ai/api/v1',
        'together': 'https://api.together.xyz/v1',
        'fireworks': 'https://api.fireworks.ai/inference/v1',
        'Nvidia': 'https://integrate.api.nvidia.com/v1',
        'jina': 'https://api.jina.ai/v1',
        'perplexity': 'https://api.perplexity.ai',
      }
      
      if (value !== 'custom' && value !== 'customAnthropic' && value !== 'OpenAIResponses') {
        this.newProviderTemp.url = defaultUrls[value] || ''
      }
      if (value === 'Ollama') {
        this.newProviderTemp.apiKey = 'ollama'
      }
      if (value === 'Vllm') {
        this.newProviderTemp.apiKey = 'Vllm'
      }
      if (value === 'LMstudio') {
        this.newProviderTemp.apiKey = 'LMstudio'
      }
      if (value === 'xinference') {
        this.newProviderTemp.apiKey = 'xinference'
      }
      if (value === 'Dify') {
        this.newProviderTemp.modelId = 'dify'
      }
      if (value === 'SGLang') {
        this.newProviderTemp.apiKey = 'SGLang' // Provider-specific default
      }
      if (value === 'llama.cpp') {
        this.newProviderTemp.apiKey = 'llamacpp' // Provider-specific default
      }
      this.newProviderTemp.models = [];
      this.newProviderTemp.modelsLoading = false;
      this.newProviderTemp.connectionStatus = null;
    },
    // Rerank provider
    async selectRankProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      if (provider) {
        this.KBSettings.model = provider.modelId;
        this.KBSettings.base_url = provider.url;
        this.KBSettings.api_key = provider.apiKey;
        await this.autoSaveSettings();
      }
    },

    // Main model provider selection
    async selectMainProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      console.log(provider)
      if (provider) {
        console.log("provider")
        this.settings.model = provider.modelId;
        this.settings.base_url = provider.url;
        this.settings.api_key = provider.apiKey;
        await this.autoSaveSettings();
      }
    },

    async selectFastProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      console.log(provider)
      if (provider) {
        console.log("provider")
        this.fastSettings.model = provider.modelId;
        this.fastSettings.base_url = provider.url;
        this.fastSettings.api_key = provider.apiKey;
        await this.autoSaveSettings();
      }
    },

    // Claude Code provider selection
    async selectCCProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      let vendor_list = {
        "Anthropic": "https://api.anthropic.com/",
      };

      let cc_url = vendor_list[provider.vendor] || provider.url;

      if (provider) {
        this.ccSettings.model = provider.modelId;
        this.ccSettings.base_url = cc_url;
        this.ccSettings.api_key = provider.apiKey;
        await this.autoSaveSettings();
      }
    },
    async selectQCProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      if (provider) {
        this.qcSettings.model = provider.modelId;
        this.qcSettings.base_url = provider.url;
        this.qcSettings.api_key = provider.apiKey;
        await this.autoSaveSettings();
      }
    },
    async selectOCProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      if (provider) {
        this.ocSettings.model = provider.modelId;
        this.ocSettings.base_url = provider.url;
        this.ocSettings.api_key = provider.apiKey;
        await this.autoSaveSettings();
      }
    },
    async selectBrainProvider(providerId) {
      // 1. Find provider details
      const provider = this.modelProviders.find(p => p.id === providerId);

      // 2. Verify provider and currently edited brain-region settings exist
      if (provider && this.currentBrainSettings) {
        // 3. Synchronize model, URL and key to current region
        this.currentBrainSettings.model = provider.modelId;
        this.currentBrainSettings.base_url = provider.url;
        this.currentBrainSettings.api_key = provider.apiKey;

        // 4. Log for diagnostics
        console.log("[" + this.currentEditingKey + "] Switched model to: " + provider.modelId);

        // 5. Autosave
        if (typeof this.autoSaveSettings === 'function') {
          await this.autoSaveSettings();
        }
      }
    },
    // Reasoning model provider selection
    async selectReasonerProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      if (provider) {
        this.reasonerSettings.model = provider.modelId;
        this.reasonerSettings.base_url = provider.url;
        this.reasonerSettings.api_key = provider.apiKey;
        await this.autoSaveSettings();
      }
    },
    async selectVisionProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      if (provider) {
        this.visionSettings.model = provider.modelId;
        this.visionSettings.base_url = provider.url;
        this.visionSettings.api_key = provider.apiKey;
        await this.autoSaveSettings();
      }
    },
    async selectText2imgProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      if (provider) {
        this.text2imgSettings.model = provider.modelId;
        this.text2imgSettings.base_url = provider.url;
        this.text2imgSettings.api_key = provider.apiKey;
        this.text2imgSettings.vendor = provider.vendor;
        if (this.text2imgSettings.vendor === 'siliconflow') {
          this.text2imgSettings.size = '1024x1024';
        }
        else {
          this.text2imgSettings.size = 'auto';
        }
        await this.autoSaveSettings();
      }
    },
    async selectAsrProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      if (provider) {
        this.asrSettings.model = provider.modelId;
        this.asrSettings.base_url = provider.url;
        this.asrSettings.api_key = provider.apiKey;
        this.asrSettings.vendor = provider.vendor;
        await this.autoSaveSettings();
      }
    },
    async selectTTSProvider(providerId) {
      const provider = this.modelProviders.find(p => p.id === providerId);
      if (provider) {
        this.ttsSettings.model = provider.modelId;
        this.ttsSettings.base_url = provider.url;
        this.ttsSettings.api_key = provider.apiKey;
        this.ttsSettings.vendor = provider.vendor;
        await this.autoSaveSettings();
      }
    },
    handleTTSProviderVisibleChange(visible) {
      if (!visible) {
        this.selectTTSProvider(this.ttsSettings.selectedProvider);
      }
    },
    handleAsrProviderVisibleChange(visible) {
      if (!visible) {
        this.selectAsrProvider(this.asrSettings.selectedProvider);
      }
    },
    handleText2imgProviderVisibleChange(visible) {
      if (!visible) {
        this.selectText2imgProvider(this.text2imgSettings.selectedProvider);
      }
    },

    handleRankProviderVisibleChange(visible) {
      if (!visible) {
        this.selectRankProvider(this.KBSettings.selectedProvider);
      }
    },

    // Additional method
    handleMainProviderVisibleChange(visible) {
      if (!visible) {
        this.selectMainProvider(this.settings.selectedProvider);
      }
    },
    handleFastProviderVisibleChange(visible) {
      if (!visible) {
        this.selectFastProvider(this.fastSettings.selectedProvider);
      }
    },

    handleCCProviderVisibleChange(visible) {
      if (!visible) {
        this.selectCCProvider(this.ccSettings.selectedProvider);
      }
    },
    handleQCProviderVisibleChange(visible) {
      if (!visible) {
        this.selectQCProvider(this.qcSettings.selectedProvider);
      }
    },
    handleOCProviderVisibleChange(visible) {
      if (!visible) {
        this.selectOCProvider(this.ocSettings.selectedProvider);
      }
    },
    handleReasonerProviderVisibleChange(visible) {
      if (!visible) {
        this.selectReasonerProvider(this.reasonerSettings.selectedProvider);
      }
    },
    handleVisionProviderVisibleChange(visible) {
      if (!visible) {
        this.selectVisionProvider(this.visionSettings.selectedProvider);
      }
    },
    handleBrainProviderVisibleChange(visible) {
      // When dropdown closes and a provider ID is selected
      if (!visible && this.currentBrainSettings && this.currentBrainSettings.selectedProvider) {
        this.selectBrainProvider(this.currentBrainSettings.selectedProvider);
      }
    },
    // Create knowledge base
    async createKnowledgeBase() {
      try {
        // Upload files
        let uploadedFiles = [];
        if (this.newKbFiles.length > 0) {
          if (!this.isElectron) {
            // Browser: upload with FormData
            const formData = new FormData();
            for (const file of this.newKbFiles) {
              if (file.file instanceof Blob) {
                formData.append('files', file.file, file.name);
              } else {
                console.error("Invalid file object:", file);
                showNotification(this.t('invalid_file'), 'error');
                return;
              }
            }
  
            try {
              console.log('Uploading files...');
              const response = await fetch(`/load_file`, {
                method: 'POST',
                body: formData
              });
  
              if (!response.ok) {
                const errorText = await response.text();
                console.error('Server responded with an error:', errorText);
                showNotification(this.t('file_upload_failed'), 'error');
                return;
              }
  
              const data = await response.json();
              if (data.success) {
                uploadedFiles = data.fileLinks; // Get uploaded file links
                // Add data.textFiles to this.textFiles
                this.textFiles = [...this.textFiles, ...data.textFiles];
                await this.autoSaveSettings();
              } else {
                showNotification(this.t('file_upload_failed'), 'error');
                return;
              }
            } catch (error) {
              console.error('Error during file upload:', error);
              showNotification(this.t('file_upload_failed'), 'error');
              return;
            }
          } else {
            // Electron: upload via JSON
            try {
              console.log('Uploading Electron files...');
              const response = await fetch(`/load_file`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  files: this.newKbFiles.map(file => ({
                    path: file.path,
                    name: file.name
                  }))
                })
              });
  
              if (!response.ok) {
                const errorText = await response.text();
                console.error('Server error:', errorText);
                showNotification(this.t('file_upload_failed'), 'error');
                return;
              }
  
              const data = await response.json();
              if (data.success) {
                uploadedFiles = data.fileLinks; // Get uploaded file links
                // Add data.textFiles to this.textFiles
                this.textFiles = [...this.textFiles, ...data.textFiles];
                await this.autoSaveSettings();
              } else {
                showNotification(this.t('file_upload_failed'), 'error');
                return;
              }
            } catch (error) {
              console.error('Upload failed:', error);
              showNotification(this.t('file_upload_failed'), 'error');
              return;
            }
          }
        }
  
        // Generate unique ID
        const kbId = uuid.v4();
  
        // Build knowledge base using uploaded file links
        const newKb = {
          id: kbId,
          name: this.newKb.name,
          introduction: this.newKb.introduction,
          providerId: this.newKb.providerId,
          model: this.newKb.model,
          base_url: this.newKb.base_url,
          api_key: this.newKb.api_key,
          enabled: true, // Enabled by default
          chunk_size: this.newKb.chunk_size,
          chunk_overlap: this.newKb.chunk_overlap,
          chunk_k: this.newKb.chunk_k,
          weight: this.newKb.weight,
          files: uploadedFiles.map(file => ({ // Use file links returned by server
            name: file.name,
            path: file.path,
          })),
          processingStatus: 'processing', // Set processing state
        };
  
        // Update knowledgeBases in settings
        this.knowledgeBases = [...(this.knowledgeBases || []), newKb];
        // Trigger modelProviders update to synchronize with backend
        this.modelProviders = this.modelProviders
        // Save settings
        await this.autoSaveSettings();
        // POST kbId to create_kb
        try {
          // 1. Start task
          const startResponse = await fetch(`/create_kb`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kbId }),
          });
          
          if (!startResponse.ok) throw new Error('Startup failed');
          // 2. Poll status
          const checkStatus = async () => {
            try {
              const statusResponse = await fetch(`/kb_status/${kbId}`);
              
              // Handle HTTP errors
              if (!statusResponse.ok) {
                console.error('Status check failed:', statusResponse.status);
                return 'failed'; // Return explicit failure status
              }
              const data = await statusResponse.json();
              return data.status || 'unknown'; // Avoid undefined
            } catch (error) {
              console.error('Status check error:', error);
              return 'failed';
            }
          };
          // Polling logic
          const interval = setInterval(async () => {
            try {
              const status = await checkStatus() || ''; // Provide fallback value
              
              const targetKb = this.knowledgeBases.find(k => k.id === kbId);
              if (!targetKb) {
                clearInterval(interval);
                return;
              }
              // Safe status comparison
              if (status === 'completed') {
                clearInterval(interval);
                targetKb.processingStatus = 'completed';
                showNotification(this.t('kb_created_successfully'), 'success');
                await this.autoSaveSettings();
              } else if (typeof status === 'string' && status.startsWith('failed')) { // Safe comparison
                clearInterval(interval);
                this.knowledgeBases = this.knowledgeBases.filter(k => k.id !== kbId);
                showNotification(this.t('kb_creation_failed'), 'error');
                await this.autoSaveSettings();
              }
            } catch (error) {
              console.error('Polling failed:', error);
              clearInterval(interval);
            }
          }, 2000);
        } catch (error) {
          console.error('Knowledge base creation failed:', error);
          showNotification(this.t('kb_creation_failed'), 'error');
        }      
        this.showAddKbDialog = false;
        this.newKb = { 
          name: '', 
          introduction: '',
          providerId: null, 
          model: '', 
          base_url: '', 
          api_key: '',
          chunk_size: 1024,
          chunk_overlap: 256,
          chunk_k: 5,
          weight: 0.5,
        };
        this.newKbFiles = [];
      } catch (error) {
        console.error('Knowledge base creation failed:', error);
        showNotification(this.t('kb_creation_failed'), 'error');
      }
    },

    // Delete knowledge base
    async removeKnowledgeBase(kb) {
      try {
        // Remove selected knowledgeBase from settings
        this.knowledgeBases = this.knowledgeBases.filter(
          item => item.id !== kb.id
        );
        let kbId = kb.id
        // Trigger modelProviders update to synchronize with backend
        this.modelProviders = this.modelProviders
        const Response = await fetch(`/remove_kb`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kbId }),
        });

        if (!Response.ok) throw new Error('Deletion failed');

        // Save settings
        await this.autoSaveSettings();

        showNotification(this.t('kb_deleted_successfully'), 'success');
      } catch (error) {
        console.error('Knowledge base deletion failed:', error);
        showNotification(this.t('kb_deletion_failed'), 'error');
      }
    },

    // Toggle knowledge base
    async toggleKbEnabled(kb) {
      try {
        // Update knowledgeBase enabled state
        const kbToUpdateIndex = this.knowledgeBases.findIndex(
          item => item.id === kb.id
        );

        if (kbToUpdateIndex !== -1) {
          this.knowledgeBases[kbToUpdateIndex].enabled = kb.enabled;
          // Trigger modelProviders update to synchronize with backend
          this.modelProviders = this.modelProviders
          // Save settings
          await this.autoSaveSettings();
          showNotification(this.t('kb')+` ${kb.name} ${kb.enabled ? this.t('enabled')  : this.t('disabled')}`, 'success');
        }
      } catch (error) {
        console.error('Failed to toggle knowledge base:', error);
        showNotification(this.t('kb_status_change_failed'), 'error');
      }
    },
    // Select provider
    selectKbProvider(providerId) {
      if (providerId == 'paraphrase-multilingual-MiniLM-L12-v2'){
        this.newKb.model = providerId;
        this.newKb.base_url = `${backendURL}/minilm`
        this.newKb.api_key = 'MiniLM';
        return;
      }

      const provider = this.modelProviders.find(p => p.id === providerId);
      if (provider) {
        this.newKb.model = provider.modelId;
        this.newKb.base_url = provider.url;
        this.newKb.api_key = provider.apiKey;
      }
    },

    // File upload methods
    async browseKbFiles() {
        if (!this.isElectron) {
          const input = document.createElement('input')
          input.type = 'file'
          input.multiple = true
          input.accept = ALLOWED_EXTENSIONS.map(ext => `.${ext}`).join(',')
          
          input.onchange = (e) => {
            const files = Array.from(e.target.files)
            const validFiles = files.filter(this.isValidFileType)
            this.handleKbFiles(validFiles)
          }
          input.click()
        } else {
          const result = await window.electronAPI.openFileDialog();
          if (!result.canceled) {
            const validPaths = result.filePaths
              .filter(path => {
                const ext = path.split('.').pop()?.toLowerCase() || ''
                return ALLOWED_EXTENSIONS.includes(ext)
              })
            this.handleKbFiles(validPaths)
          }
        }
    },

    handleKbFiles(files) {
        if (files.length > 0) {
          this.addKbFiles(files)
        } else {
          this.showErrorAlert()
        }
    },
      // Add files to list
    addKbFiles(files) {
      const newFiles = files.map(file => {
        if (typeof file === 'string') { // Electron path
          return {
            path: file,
            name: file.split(/[\\/]/).pop()
          }
        }
        return { // Browser File object
          path: URL.createObjectURL(file),// Generate temporary URL
          name: file.name,
          file: file
        }
      });
      
      this.newKbFiles = [...this.newKbFiles, ...newFiles];
    },
    async handleKbDrop(event) {
      event.preventDefault();
      const files = Array.from(event.dataTransfer.files)
        .filter(this.isValidFileType);
      this.handleKbFiles(files);
    },
    removeKbFile(index) {
      this.newKbFiles.splice(index, 1);
    },
    switchToKnowledgePage() {
      this.activeMenu = 'toolkit';  // Select main menu
      this.subMenu = 'document';   // Select submenu
    },
    switchToKnowledgeConfig(){
      this.activeMenu = 'toolkit';  // Select main menu
      this.subMenu = 'document';   // Select submenu
      this.activeKbTab='settings';
      this.showAddKbDialog=false;
    },
    switchToMemoryConfig(){
      this.activeMenu = 'role';  // Select main menu
      this.subMenu = 'memory';   // Select submenu
      this.activeMemoryTab='config';
      this.showAddMemoryDialog=false;
    },
    switchToMemory(){
      this.activeMenu = 'role';
      this.subMenu = 'memory'; 
    },
    toggleOptionalFeatures() {
      this.showOptionalFeatures = !this.showOptionalFeatures;
      if (!this.showOptionalFeatures) {
        if (['dashboard', 'deploy-bot', 'api-group'].includes(this.activeMenu)) {
          this.activeMenu = 'home';
          this.subMenu = '';
        }
        if (this.activeMenu === 'role' && this.subMenu === 'sticker') this.subMenu = 'memory';
        if (this.activeMenu === 'model-config' && this.subMenu === 'text2img') this.subMenu = 'main';
        if (this.activeMenu === 'toolkit' && ['HA', 'sql', 'comfyui', 'customHttpTool'].includes(this.subMenu)) this.subMenu = 'tools';
      }
    },
    // Character and model settings remain available when optional panels are hidden.
    t(key) {
      return this.translations['en-US']?.[key] || key;
    },
    async handleSystemLanguageChange() {
      // UI locale is fixed; ASR and translation languages are separate settings.
      this.systemSettings.language = 'en-US';
      this.currentLanguage = 'en-US';
      await this.autoSaveSettings();
      this.$forceUpdate();
    },
    // Renderer helper methods
    async handleThemeChange(val) {
      // Update root attributes
      document.documentElement.setAttribute('data-theme', val);
      
      this.systemSettings.theme = val;

      await this.autoSaveSettings();
    },
    // Global font zoom: 14px baseline, range 0.85 to 1.5.
    // Electron uses webFrame.setZoomFactor for antialiasing; other environments use CSS zoom.
    async handleFontScaleChange(val) {
      const safe = Math.max(0.85, Math.min(1.5, Number(val) || 1));
      if (this.isElectron && window.electronAPI?.setZoomFactor) {
        try {
          window.electronAPI.setZoomFactor(safe);
        } catch (e) {
          document.documentElement.style.zoom = safe;
        }
      } else {
        document.documentElement.style.zoom = safe;
      }
      document.documentElement.style.setProperty('--app-zoom', String(safe));
      this.systemSettings.fontScale = safe;
      await this.autoSaveSettings();
    },
    resetFontScale() {
      this.handleFontScaleChange(1);
    },
    // Independent code zoom: 12px baseline from github-markdown.css, range 0.83 to 1.67.
    // Set --code-zoom; styles.css uses calc(--code-zoom / --app-zoom) to offset global zoom.
    async handleCodeFontScaleChange(val) {
      const safe = Math.max(0.83, Math.min(1.67, Number(val) || 1));
      document.documentElement.style.setProperty('--code-zoom', String(safe));
      this.systemSettings.codeFontScale = safe;
      await this.autoSaveSettings();
    },
    resetCodeFontScale() {
      this.handleCodeFontScaleChange(1);
    },
    async handleNetworkChange(val) {
      this.systemSettings.network = val;
      await window.electronAPI.setNetworkVisibility(val);
      this.showRestartDialog = true;
      await this.autoSaveSettings();
    },

    restartApp() {
      window.electronAPI.restartApp();
    },

    // Method implementation
    launchBrowserMode() {
      this.isBrowserOpening = true;
      
      setTimeout(() => {
        const url = this.partyURL;
        if (isElectron) {
          window.electronAPI.openExternal(url);
        } else {
          window.open(url, '_blank');
        }
        
        // Restore state after two seconds
        setTimeout(() => {
          this.isBrowserOpening = false;
        }, 2000);
      }, 500);
    },
    launchAPIKeyManager() {
      this.isBrowserOpening = true;
      
      setTimeout(() => {
        const url = this.partyURL + '/token.html';
        if (isElectron) {
          window.electronAPI.openExternal(url);
        } else {
          window.open(url, '_blank');
        }
        
        // Restore state after two seconds
        setTimeout(() => {
          this.isBrowserOpening = false;
        }, 2000);
      }, 500);
    },

    async getInternalIP() {
        try {
            const response = await fetch('/api/ip'); // Same-origin endpoint
            const data = await response.json();
            return data.ip;
        } catch (error) {
            console.error("Failed to fetch internal IP:", error);
            return "127.0.0.1";
        }
    },
    async generateQRCode() {
      // Ensure partyURL exists and DOM has rendered
      if (!this.partyURL) return;
      // Get local network IP
      const internalIP = await this.getInternalIP();

      // Replace 127.0.0.1 or localhost while preserving port and path
      const url = new URL(this.partyURL);
      if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
        url.hostname = internalIP;
      }
      let qr_url = url.toString();
      const canvas = document.getElementById('qrcode');

      // Generate QR code
      QRCode.toCanvas(canvas, qr_url, function(error) {
            if (error) {
                console.error(error);
            } else {
                console.log("QR Code successfully generated!");
            }
        });
    },


    /**
     * Build configuration from current form or JSON input.
     * Return { mcpId, serversObj, inputStr }
     */
    buildCurrentMCPConfig() {
      let mcpId = "mcp";
      let servers = {};
      let inputStr = "";

      if (this.mcpInputType === 'json') {
        const input = this.newMCPJson.trim();
        const parsed = JSON.parse(input.startsWith('{') ? input : `{${input}}`);
        const parsedServers = parsed.mcpServers || parsed;
        mcpId = Object.keys(parsedServers)[0];
        servers = parsedServers[mcpId];
        inputStr = input;
      } else {
        mcpId = this.newMCPFormData.name;
        
        if (this.newMCPType === 'stdio') {
          servers = { "command": this.newMCPFormData.command };
          
          // args
          let args = this.newMCPFormData.args;
          if (args) {
             servers['args'] = args.split('\n').map(arg => arg.trim()).filter(arg => arg);
          }
          
          // env
          let env = this.newMCPFormData.env;
          if (env) {
            servers['env'] = env.split('\n').map(e => e.trim()).filter(e => e).reduce((acc, cur) => {
              const parts = cur.split('=');
              if (parts.length >= 2) {
                  const key = parts[0].trim();
                  const value = parts.slice(1).join('=').trim();
                  acc[key] = value;
              }
              return acc;
            }, {});
          }
        } else {
          servers = { "url": this.newMCPFormData.url };
          let ContentType = 'application/json';
          if (this.newMCPType == 'sse') ContentType = 'text/event-stream';
          else if (this.newMCPType == 'ws') ContentType = 'text/plain';
          
          if (this.newMCPFormData.apiKey && this.newMCPFormData.apiKey.trim() != '') {
            servers['headers'] = {
              "Authorization": `Bearer ${this.newMCPFormData.apiKey.trim()}`,
              "Content-Type": ContentType
            }
          }
        }

        // Build input string for storage
        let inputObj = { "mcpServers": {} };
        inputObj.mcpServers[mcpId] = servers;
        inputStr = JSON.stringify(inputObj, null, 2);
      }

      return { mcpId, servers, inputStr };
    },

    /**
     * Add method delegates to buildCurrentMCPConfig.
     */
    async addMCPServer() {
      try {
        const { mcpId, servers, inputStr } = this.buildCurrentMCPConfig();

        // Update local state
        this.mcpServers = {
          ...this.mcpServers,
          [mcpId]: {
            ...servers, // New configuration
            processingStatus: 'initializing',
            disabled: true,
            type: this.newMCPType,
            input: inputStr,
            // For edit/restart, preserve existing tools until ready
            // When ID matches, retain tools temporarily to avoid UI flicker
            tools: (this.mcpServers[mcpId] && this.mcpServers[mcpId].tools) || []
          }
        };

        this.isSubmitting = true;
        this.currentEditingMCPId = mcpId;
        
        await this.autoSaveSettings();

        // Start background creation
        await fetch(`/create_mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mcpId })
        });

        // Poll status
        await this.pollMCPStatus(mcpId); // Reuse status polling

        // Switch mode after success
        this.isEditMode = true;
        this.activeDialogTab = 'tools';
      } catch (error) {
        console.error('MCP Add Error:', error);
        showNotification(error.message, 'error');
        if (this.currentEditingMCPId && this.mcpServers[this.currentEditingMCPId]) {
             this.mcpServers[this.currentEditingMCPId].processingStatus = 'server_error';
        }
      } finally {
        this.isSubmitting = false;
        await this.autoSaveSettings();
      }
    },

    /**
     * Update configuration and determine whether restart is needed.
     */
    async updateMCPServerConfig() {
      const currentId = this.currentEditingMCPId;
      const oldServer = this.mcpServers[currentId];
      
      if (!oldServer) return;

      // 1. Build configuration from new form
      // Do not write to this.mcpServers yet
      let newConfigData;
      try {
        newConfigData = this.buildCurrentMCPConfig();
      } catch (e) {
        showNotification(this.t('invalidConfig'), 'error');
        return;
      }
      
      const { servers: newServersObj } = newConfigData;

      // 2. Compare core connection fields: Command, Args, Env, Url, Headers
      // Ignore tools, processingStatus, disabled and other state
      const isConfigurationChanged = !this.isSameMCPConfig(oldServer, newServersObj);

      if (isConfigurationChanged) {
        // A. Restart through addMCPServer if configuration changed
        console.log("Configuration changed, restarting MCP...");
        await this.addMCPServer();
      } else {
        // B. Close without restarting if unchanged
        console.log("Configuration identical, skipping restart.");
        showNotification(this.t('settingsSaved'), 'success');
        this.showAddMCPDialog = false;
      }
    },

    /**
     * Deep compare MCP configurations using core connection parameters only.
     */
    isSameMCPConfig(oldSrv, newSrv) {
      // Comparison helper
      const jsonEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

      // 1. Compare primitive types
      // oldSrv may include extra fields; newSrv contains configuration only
      // Compare only fields present in newSrv
      
      // Stdio check
      if (newSrv.command !== oldSrv.command) return false;
      if (!jsonEq(newSrv.args, oldSrv.args)) return false;
      if (!jsonEq(newSrv.env, oldSrv.env)) return false;

      // HTTP/SSE/WS check
      if (newSrv.url !== oldSrv.url) return false;
      if (!jsonEq(newSrv.headers, oldSrv.headers)) return false;

      return true;
    },

    // Additional method
    // Helper to open add dialog
    openAddDialog() {
      this.showAddMCPDialog = true;
      this.activeDialogTab = 'config';
      this.isEditMode = false;
      this.isSubmitting = false;
      this.currentEditingMCPId = null;
      this.newMCPJson = '';
      this.newMCPFormData = { name: '', command: '', args: '', env: '', url: '', apiKey: '' };
      this.updateMCPExample();
    },

    // Reset dialog state
    resetDialogState() {
        this.newMCPJson = '';
        this.isSubmitting = false;
        // Do not set showAddMCPDialog = false in the closed event
    },

    // Shared polling logic
    async pollMCPStatus(mcpId) {
       return new Promise((resolve, reject) => {
          let checkCount = 0;
          const maxChecks = 30; // Example: 60-second timeout

          const interval = setInterval(async () => {
            checkCount++;
            try {
              const statusRes = await fetch(`/mcp_status/${mcpId}`);
              const data = await statusRes.json();
              const { status, tools } = data;

              if (status === 'ready') {
                clearInterval(interval);
                this.mcpServers[mcpId] = {
                  ...this.mcpServers[mcpId],
                  processingStatus: 'ready',
                  disabled: false,
                  tools: JSON.parse(tools)    
                };
                showNotification(this.t('mcpAdded'), 'success');
                resolve(true); // Success
              } else if (status.startsWith('failed') || status === 'server_error') {
                clearInterval(interval);
                this.mcpServers[mcpId].processingStatus = 'server_error';
                showNotification(this.t('mcpCreationFailed'), 'error');
                resolve(false); // Failure also ends polling
              } else if (checkCount >= maxChecks) {
                clearInterval(interval);
                this.mcpServers[mcpId].processingStatus = 'server_error';
                reject(new Error("Timeout waiting for MCP server"));
              }
            } catch(e) {
               // Network errors and other exceptions
               clearInterval(interval);
               reject(e);
            }
          }, 2000);
       });
    },

    // Edit existing server
    editMCPServer(name) {
      this.isEditMode = true;
      this.activeDialogTab = 'config';
      this.currentEditingMCPId = name;
      this.isSubmitting = false;

      const server = this.mcpServers[name];
      this.newMCPType = server.type || 'stdio'; // Default fallback
      this.newMCPJson = server.input;
      
      // Infer inputType from server input when appropriate
      // Populate form when editMCPServer is called
      this.mcpInputType = 'form'; // Alternatively infer mode from input string

      this.newMCPFormData = {
        name: name,
        command: server.command || '',
        args: server.args ? server.args.join('\n') : '',
        env: server.env ? Object.entries(server.env).map(([k, v]) => `${k}=${v}`).join('\n') : '',
        url: server.url || '',
        apiKey: server.headers?.Authorization?.split(' ')[1] || '',
      };
      
      this.showAddMCPDialog = true;
    },

    async restartMCPServer(name) {
       // Retain existing restart behavior or show a loading dialog
       // Reuse logic with error handling
       this.mcpServers[name].processingStatus = 'initializing';
       // ... existing restart logic
       // Optionally show edit dialog and trigger restart
       // Restart normally remains a card-level shortcut
       // Add status polling
       try {
         await fetch(`/create_mcp`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mcpId: name })
            });
         this.pollMCPStatus(name); // Poll in the background without awaiting
       } catch(e) {
         console.error(e);
       }
    },
    async removeMCPServer(name) {
      this.deletingMCPName = name
      this.showMCPConfirm = true
    },
    // Confirmation method
    async confirmDeleteMCP() {
      try {
        const response = await fetch(`/remove_mcp`, {
          method: 'DELETE',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            serverName: this.deletingMCPName
          })
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Deletion failed');
        }
        
        showNotification(this.t('mcpDeleted'), 'success')
      } catch (error) {
        console.error('Error:', error.message)
        showNotification(this.t('mcpDeleteFailed'), 'error')
      } finally {
        const name = this.deletingMCPName
        const newServers = { ...this.mcpServers }
        delete newServers[name]
        this.mcpServers = newServers
        
        this.$nextTick(async () => {
          await this.autoSaveSettings();
        })
        this.showMCPConfirm = false
      }
    },

    /**
     * Watch input mode changes (Form <-> JSON).
     */
    handleInputMethodChange(val) {
      if (val === 'json') {
        // Form to JSON: serialize form
        this.syncFormToJson();
      } else {
        // JSON to form: parse JSON
        this.syncJsonToForm();
      }
    },

    /**
     * Synchronize form data to JSON.
     */
    syncFormToJson() {
      // Do not overwrite JSON before the form name is filled
      if (!this.newMCPFormData.name) return;

      try {
        // Build configuration object independently
        const mcpId = this.newMCPFormData.name;
        let servers = {};
        
        if (this.newMCPType === 'stdio') {
          servers = { "command": this.newMCPFormData.command };
          if (this.newMCPFormData.args) {
             servers['args'] = this.newMCPFormData.args.split('\n').map(arg => arg.trim()).filter(arg => arg);
          }
          if (this.newMCPFormData.env) {
            servers['env'] = this.newMCPFormData.env.split('\n').map(e => e.trim()).filter(e => e).reduce((acc, cur) => {
              const parts = cur.split('=');
              if (parts.length >= 2) acc[parts[0].trim()] = parts.slice(1).join('=').trim();
              return acc;
            }, {});
          }
        } else {
          servers = { "url": this.newMCPFormData.url };
          // Build headers
          if (this.newMCPFormData.apiKey) {
            servers['headers'] = { "Authorization": `Bearer ${this.newMCPFormData.apiKey.trim()}` };
          }
        }

        const fullConfig = { mcpServers: { [mcpId]: servers } };
        this.newMCPJson = JSON.stringify(fullConfig, null, 2);
      } catch (e) {
        console.error("Sync Form to JSON failed:", e);
      }
    },

    /**
     * Synchronize JSON to form fields.
     */
    syncJsonToForm() {
      if (!this.newMCPJson || !this.newMCPJson.trim()) return;

      try {
        const input = this.newMCPJson.trim();
        // Accept a bare object or complete mcpServers structure
        const parsed = JSON.parse(input.startsWith('{') ? input : `{${input}}`);
        const serversMap = parsed.mcpServers || parsed;
        const names = Object.keys(serversMap);
        
        if (names.length === 0) return;

        const name = names[0]; // Take first server
        const config = serversMap[name];

        // 1. Populate name
        this.newMCPFormData.name = name;

        // 2. Determine type and populate fields
        if (config.command) {
          // Stdio type
          this.newMCPType = 'stdio';
          this.newMCPFormData.command = config.command;
          this.newMCPFormData.args = Array.isArray(config.args) ? config.args.join('\n') : '';
          this.newMCPFormData.env = config.env ? Object.entries(config.env).map(([k, v]) => `${k}=${v}`).join('\n') : '';
        } else if (config.url) {
          // HTTP/SSE/WS type
          // If newMCPType is stdio, switch to sse; otherwise preserve selection
          if (this.newMCPType === 'stdio') {
             this.newMCPType = 'sse'; 
          }
          this.newMCPFormData.url = config.url;
          
          // Try extracting API key
          if (config.headers && config.headers.Authorization) {
            this.newMCPFormData.apiKey = config.headers.Authorization.replace('Bearer ', '');
          } else {
            this.newMCPFormData.apiKey = '';
          }
        }
      } catch (e) {
        console.warn("JSON parse failed during sync:", e);
        // On invalid JSON, leave existing form values intact
      }
    },

      // Save agent
    truncatePrompt(text) {
      return text.length > 100 ? text.substring(0, 100) + '...' : text;
    },
    async saveAgent() {
      const payload = {
        type: 'save_agent',
        data: {
          name: this.newAgent.name,
          system_prompt: this.newAgent.system_prompt
        }
      };
      this.ws.send(JSON.stringify(payload));
      this.showAgentForm = false;
      this.newAgent = {
        id: '',
        name: '',
        system_prompt: ''
      };
    },
    copyAgentId(id) {
      navigator.clipboard.writeText(id)
      showNotification(`Agent ID: ${id} copyed`, 'success');
    },
    copyAgentName(name) {
      navigator.clipboard.writeText(name)
      showNotification(`Agent Name: ${name} copyed`, 'success');
    },
    async removeAgent(id) {
      if (this.agents.hasOwnProperty(id)) {
        delete this.agents[id]
        this.agents = { ...this.agents }
        try {
          // Send request to /delete_file
          const response = await fetch(`/remove_agent`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: id })
          });
          // Handle response
          if (response.ok) {
            console.log('Agent deleted successfully');
            showNotification(this.t('AgentDeleted'), 'success');
          }
        } catch (error) {
          console.error('Error:', error);
          showNotification(this.t('AgentDeleteFailed'), 'error');
        }
      }
      await this.autoSaveSettings();
    },
    isValidUrl(url) {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    },
    async addA2AServer() {
      try {
        this.showAddA2ADialog = false;
        const newurl = this.newA2AUrl;
        this.newA2AUrl = '';
        this.a2aServers = {
          ...this.a2aServers,
          [newurl]: {
            status: 'initializing',
          }
        };
        await this.autoSaveSettings();
        const response = await fetch(`/a2a`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: newurl })
        });
        
        const data = await response.json();
        this.a2aServers[newurl] = {
          ...this.a2aServers[newurl],
          ...data
        }

        await this.autoSaveSettings();
      } catch (error) {
        console.error('A2A initialization failed:', error);
        this.a2aServers = Object.fromEntries(Object.entries(this.a2aServers).filter(([k]) => k !== newurl));
        await this.autoSaveSettings();
        showNotification(this.t('a2aInitFailed'), 'error');
      }
    },
    async removeA2AServer(url) {
      this.a2aServers = Object.fromEntries(Object.entries(this.a2aServers).filter(([k]) => k !== url));
      await this.autoSaveSettings();
    },
    formatDate(date) {
      // Convert timestamp to date
      return new Date(date).toLocaleString();
    },
    async deleteFile(file) {
      console.log('deleteFile:', file);
      this.textFiles = this.textFiles.filter(f => f !== file);
      await this.autoSaveSettings();
      fileName = file.unique_filename
      try {
        // Send request to /delete_file
        const response = await fetch(`/delete_file`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: fileName })
        });
        // Handle response
        if (response.ok) {
          console.log('File deleted successfully');
          showNotification(this.t('fileDeleted'), 'success');
        }
      } catch (error) {
        console.error('Error:', error);
        showNotification(this.t('fileDeleteFailed'), 'error');
      }
    },
    // Top select-all toggle
    toggleAll(checked) {
      this.selectedFiles = checked
        ? this.textFiles.map(f => f.unique_filename)
        : [];
    },
    async batchDeleteFiles() {
      if (this.selectedFiles.length === 0) return;

      try {
        const res = await fetch('/delete_files', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileNames: this.selectedFiles })
        });
        const data = await res.json();

        // Report success if backend reports any successful deletion
        if (data.success && data.successFiles?.length) {
          // Remove successfully deleted files
          this.textFiles = this.textFiles.filter(
            f => !data.successFiles.includes(f.unique_filename)
          );
          this.selectedFiles = [];          // Clear selection
          showNotification(this.t('batchDeleteSuccess'), 'success');
          await this.autoSaveSettings();
        } else {
          console.log('batchDeleteFiles error:', data);
          showNotification(this.t('batchDeleteFailed'), 'error');
        }
      } catch (e) {
        console.log('batchDeleteFiles error:', data);
        showNotification(this.t('batchDeleteFailed'), 'error');
      }
    },

    // Toggle all images
    toggleAllImages(checked) {
      this.selectedImages = checked
        ? this.imageFiles.map(i => i.unique_filename)
        : []
    },
    
    // Toggle all videos
    toggleAllVideos(checked) {
      this.selectedVideos = checked
        ? this.videoFiles.map(v => v.unique_filename)
        : []
    },
    
    // Batch image deletion
    async batchDeleteImages() {
      if(!this.selectedImages.length) return
      
      try {
        const res = await fetch('/delete_files', {
          method: 'DELETE',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({fileNames: this.selectedImages})
        })
        
        if(res.ok) {
          // Update frontend list
          this.imageFiles = this.imageFiles.filter(
            img => !this.selectedImages.includes(img.unique_filename)
          )
          this.selectedImages = []
          showNotification(this.t('batchDeleteSuccess'), 'success')
          await this.autoSaveSettings();
        }
      } catch(e) {
        showNotification(this.t('batchDeleteFailed'), 'error')
      }
    },
    
    // Batch video deletion using the shared API
    async batchDeleteVideos() {
      if(!this.selectedVideos.length) return
      try {
        const res = await fetch('/delete_files', {
          method: 'DELETE',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({fileNames: this.selectedVideos})
        })
        
        if(res.ok) {
          // Update frontend list
          this.videoFiles = this.videoFiles.filter(
            img => !this.selectedVideos.includes(img.unique_filename)
          )
          this.selectedVideos = []
          showNotification(this.t('batchDeleteSuccess'), 'success')
          await this.autoSaveSettings();
        }
      } catch(e) {
        showNotification(this.t('batchDeleteFailed'), 'error')
      }
    },
    async deleteImage(img) {
      this.imageFiles = this.imageFiles.filter(i => i !== img);
      await this.autoSaveSettings();
      fileName = img.unique_filename
      try {
        // Send request to /delete_file
        const response = await fetch(`/delete_file`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: fileName })
        });
        // Handle response
        if (response.ok) {
          console.log('File deleted successfully');
          showNotification(this.t('fileDeleted'), 'success');
        }
      } catch (error) {
        console.error('Error:', error);
        showNotification(this.t('fileDeleteFailed'), 'error');
      }
    },
    getVendorLogo(vendor) {
      return null;
    },
    getMCPVendorLogo(vendor) {
      return null;
    },
    getPromptVendorLogo(vendor) {
      return null;
    },
    getCardVendorLogo(vendor) {
      return null;
    },
    formatVendorName(name) {
      if (!name) return '';
      const first = name.charAt(0);
      if (first >= 'a' && first <= 'z') return first.toUpperCase() + name.slice(1);
      return name;
    },
    getVendorInitials(vendor) {
      if (!vendor) return '?';
      const words = vendor.split(/[\s\-_\.]+/).filter(w => w.length > 0);
      if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
      return vendor.substring(0, 2).toUpperCase();
    },
    getVendorAvatarColor(vendor) {
      const palette = [
        '#007AFF', '#FF9500', '#34C759', '#FF3B30',
        '#AF52DE', '#5856D6', '#FF2D55', '#00C7BE',
        '#8E8E93', '#FFD60A', '#32D74B', '#0A84FF'
      ];
      let hash = 0;
      const str = vendor || '';
      for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
      return palette[Math.abs(hash) % palette.length];
    },
    handleSelectVendor(vendor) {
      this.newProviderTemp.vendor = vendor;
      this.handleVendorChange(vendor);
    },

    selectMemoryProvider(providerId) {
      if (providerId == 'paraphrase-multilingual-MiniLM-L12-v2'){
        this.newMemory.model = providerId;
        this.newMemory.base_url = `${backendURL}/minilm`
        this.newMemory.api_key = 'MiniLM';
        return;
      }

      const provider = this.modelProviders.find(p => p.id === providerId);
      if (provider) {
        this.newMemory.model = provider.modelId;
        this.newMemory.base_url = provider.url;
        this.newMemory.api_key = provider.apiKey;
      }
    },

    // Clear worldbook entries
    clearBook(idx) {
      this.newMemory.characterBook[idx].keysRaw = '';
      this.newMemory.characterBook[idx].content = '';
    },
    /* Worldbook */
    addBook() {
      this.newMemory.characterBook.push({ keysRaw: '', content: '' });
    },
    removeBook(idx) {
      this.newMemory.characterBook.splice(idx, 1);
    },
    clearGreeting(idx) {
      this.newMemory.alternateGreetings[idx] = '';
    },
    clearFirstMes() {
      this.newMemory.firstMes = '';
    },
    /* Delete alternate greeting */
    removeGreeting(idx) {
      this.newMemory.alternateGreetings.splice(idx, 1);
    },
    /* Add alternate greeting */
    addGreeting() {
      this.newMemory.alternateGreetings.push('');
    },
    async addMemory() {
      this.selectMemoryProvider(this.newMemory.providerId);

      /* ---- 0. Back up existing data for update ---- */
      const oldMemory = this.newMemory.id
        ? this.memories.find(m => m.id === this.newMemory.id)
        : 1024;

      /* ---- 1. Create the in-memory object immediately ---- */
      const build = (dims = 1024) => ({
        id: this.newMemory.id || uuid.v4(),
        name: this.newMemory.name,
        infer: this.newMemory.infer,
        providerId: this.newMemory.providerId,
        model: this.newMemory.model,
        api_key: this.newMemory.api_key,
        base_url: this.newMemory.base_url,
        embedding_dims: dims,
        vendor: this.newMemory.providerId
          ? this.modelProviders.find(p => p.id === this.newMemory.providerId)?.vendor || ''
          : '',
        description: this.newMemory.description,
        avatar: this.newMemory.avatar,
        personality: this.newMemory.personality,
        mesExample: this.newMemory.mesExample,
        systemPrompt: this.newMemory.systemPrompt,
        firstMes: this.newMemory.firstMes,
        alternateGreetings: this.newMemory.alternateGreetings.filter(Boolean),
        characterBook: this.newMemory.characterBook.filter(e => e.keysRaw.trim() || e.content.trim())
      });

      let memory;
      let insertIdx = -1;          // Index used when updating
      if (this.newMemory.id === null) {
        memory = build();
        this.memories.push(memory);
        if (this.memorySettings.selectedMemory === null) {
          this.memorySettings.selectedMemory = memory.id;
        }
      } else {
        insertIdx = this.memories.findIndex(m => m.id === this.newMemory.id);
        if (insertIdx === -1) return;
        memory = build(oldMemory?.embedding_dims ?? 1024);
        this.memories.splice(insertIdx, 1, memory);
      }
      this.showAddMemoryDialog = false;
      if (this.newMemory.providerId != null){
        /* ---- 2. Probe dimensions asynchronously; roll back on failure ---- */
        try {
          const resp = await fetch('/api/embedding_dims', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key:  this.newMemory.api_key,
              base_url: this.newMemory.base_url,
              model:    this.newMemory.model
            })
          });

          // ******** Validate response ********
          if (!resp.ok) {                           // Handle 4xx and 5xx responses
            const txt = await resp.text();
            throw new Error(`Embedding API error ${resp.status}: ${txt}`);
          }

          const { dims } = await resp.json();
          // Warn on dimension changes that could mismatch existing memory and FAISS indexes
          if (this.newMemory.id && oldMemory && oldMemory.embedding_dims && dims !== oldMemory.embedding_dims) {
            showNotification(
              `${this.t('embeddingDimsChanged') || 'Embedding dimension changed'}: ${oldMemory.embedding_dims} → ${dims}. ${this.t('existingMemoriesPreserved') || 'Existing memories are preserved but may need re-vectorization.'}`,
              'warning'
            );
          }
          memory.embedding_dims = dims;
          await this.autoSaveSettings();          // Persist settings
        } catch (e) {
          /* ---- 3. Roll back and notify ---- */
          if (this.newMemory.id === null) {
            // For new entries, pop the added item
            this.memories.pop();
            if (this.memorySettings.selectedMemory === memory.id) {
              this.memorySettings.selectedMemory = null;
            }
          } else {
            // For updates, restore the old memory
            if (oldMemory) this.memories.splice(insertIdx, 1, oldMemory);
          }
          // Ensure the translation function is available
          showNotification(this.t('EmbeddingFailed'), 'error');
          console.error('[addMemory] Dimension probe failed', e);
          return;   // Stop processing
        }
      }

      /* ---- 4. Finish ---- */
      this.resetNewMemory();
      this.changeMemory();
    },
    
    async removeMemory(id) {
      this.memories = this.memories.filter(m => m.id !== id);
      if (this.memorySettings.selectedMemory === id){
        this.memorySettings.selectedMemory = null;
      }
      try {
        // Send request to /delete_file
        const response = await fetch(`/remove_memory`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memoryId: id })
        });
        // Handle response
        if (response.ok) {
          console.log('memory deleted successfully');
          showNotification(this.t('memoryDeleted'), 'success');
        }
      } catch (error) {
        console.error('Error:', error);
        showNotification(this.t('memoryDeleteFailed'), 'error');
      }
      await this.autoSaveSettings();
    },
    editMemory(id) {
      const memory = this.memories.find(m => m.id === id);
      if (memory) {
        this.newMemory = { ...memory };
        if (this.newMemory.characterBook.length === 0){
          this.newMemory.characterBook = [{ keysRaw: '', content: '' }];
        }
        this.showAddMemoryDialog = true;
      }
    },

    
    getVendorName(providerId) {
      if (providerId == 'paraphrase-multilingual-MiniLM-L12-v2'){
        return `${this.t("model")}:${providerId}`;
      }
      const provider = this.modelProviders.find(p => p.id === providerId);
      return provider ? `${this.t("model")}:${provider.modelId}` : this.t("NoLongTermMemory");
    },
    async saveCustomHttpTool() {
      const toolData = { ...this.newCustomHttpTool };
      
      if (this.editingCustomHttpTool) {
        // Update existing tool
        const index = this.customHttpTools.findIndex(tool => tool.id === toolData.id);
        if (index !== -1) {
          this.customHttpTools.splice(index, 1, toolData);
        }
      } else {
        // Add new tool
        toolData.id = uuid.v4();
        this.customHttpTools.push(toolData);
      }
      
      // Synchronize data with backend
      await this.autoSaveSettings();
      
      // Reset form
      this.newCustomHttpTool = {
        enabled: true,
        name: '',
        description: '',
        url: '',
        method: 'GET',
        headers: '',
        body: ''
      };
      this.showCustomHttpToolForm = false;
      this.editingCustomHttpTool = false;
    },
    editCustomHttpTool(id) {
      const tool = this.customHttpTools.find(tool => tool.id === id);
      if (tool) {
        this.newCustomHttpTool = { ...tool };
        this.showCustomHttpToolForm = true;
        this.editingCustomHttpTool = true;
      }
    },
    async removeCustomHttpTool(id) {
      this.customHttpTools = this.customHttpTools.filter(tool => tool.id !== id);
      await this.autoSaveSettings();
    },
  // Optional messaging adapters: Telegram, Discord, and Slack.
async startTelegramBot() {
  this.isTelegramStarting = true;
  try {
    showNotification('Connecting Telegram bot...', 'info');
    const res = await fetch('/start_telegram_bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.telegramBotConfig)
    });
    const json = await res.json();
    if (json.success) {
      this.isTelegramBotRunning = true;
      showNotification('Telegram bot started', 'success');
    } else {
      showNotification(`Startup failed: ${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('Network error or server not responding', 'error');
  } finally {
    this.isTelegramStarting = false;
  }
},
async stopTelegramBot() {
  this.isTelegramStopping = true;
  try {
    const res = await fetch('/stop_telegram_bot', { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      this.isTelegramBotRunning = false;
      showNotification('Telegram bot stopped', 'success');
    } else {
      showNotification(`Stop failed: ${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('Network error or server not responding', 'error');
  } finally {
    this.isTelegramStopping = false;
  }
},
async reloadTelegramBotConfig() {
  this.isTelegramReloading = true;
  try {
    const res = await fetch('/reload_telegram_bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.telegramBotConfig)
    });
    const json = await res.json();
    if (json.success) {
      showNotification('Telegram bot reloaded', 'success');
    } else {
      showNotification(`Reload failed: ${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('Network error or server not responding', 'error');
  } finally {
    this.isTelegramReloading = false;
  }
},
async checkTelegramBotStatus() {
  try {
    const res = await fetch('/telegram_bot_status');
    const st = await res.json();
    this.isTelegramBotRunning = st.is_running;
  } catch (e) {
    console.error('Telegram bot status check failed', e);
  }
},
handleCreateTelegramSeparator(val) {
  this.telegramBotConfig.separators.push(val);
},

/* ------- Discord bot ------- */
async startDiscordBot() {
  this.isDiscordStarting = true;
  try {
    showNotification('Connecting Discord bot...', 'info');
    const res = await fetch('/start_discord_bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.discordBotConfig),
    });
    const json = await res.json();
    if (json.success) {
      this.isDiscordBotRunning = true;
      showNotification('Discord bot started', 'success');
    } else {
      showNotification(`Startup failed: ${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('Network error or server not responding', 'error');
  } finally {
    this.isDiscordStarting = false;
  }
},
async stopDiscordBot() {
  this.isDiscordStopping = true;
  try {
    const res = await fetch('/stop_discord_bot', { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      this.isDiscordBotRunning = false;
      showNotification('Discord bot stopped', 'success');
    } else {
      showNotification(`Stop failed: ${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('Network error or server not responding', 'error');
  } finally {
    this.isDiscordStopping = false;
  }
},
async reloadDiscordBot() {
  this.isDiscordReloading = true;
  try {
    const res = await fetch('/reload_discord_bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.discordBotConfig),
    });
    const json = await res.json();
    if (json.success) {
      showNotification('Discord bot reloaded', 'success');
    } else {
      showNotification(`Reload failed: ${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('Network error or server not responding', 'error');
  } finally {
    this.isDiscordReloading = false;
  }
},
async checkDiscordBotStatus() {
  try {
    const res = await fetch('/discord_bot_status');
    const st = await res.json();
    this.isDiscordBotRunning = st.is_running;
  } catch (e) {
    console.error('Discord bot status check failed', e);
  }
},
handleCreateDiscordSeparator(val) {
  this.discordBotConfig.separators.push(val);
},

async requestSlackBotStopIfRunning() {
    try {
      // 1. Check actual Slack bot state on the backend
      const response = await fetch(`/slack_bot_status`);
      const status = await response.json();

      // 2. If the backend reports is_running
      if (status.is_running) {
        // 3. Call stopSlackBot
        // This handles stopping, loading state and notification
        await this.stopSlackBot();
        console.log('Slack bot stopped at the system request');
      }
    } catch (error) {
      // Handle network errors or backend not running
      console.error('Failed to check or stop Slack bot:', error);
    }
  },

/* ------- Slack bot ------- */
async startSlackBot() {
  this.isSlackStarting = true;
  try {
    showNotification('Connecting Slack bot...', 'info');
    // Send slackBotConfig; backend handles shared memorySettings
    const res = await fetch('/start_slack_bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...this.slackBotConfig,
        // Explicitly pass current memory configuration
        memory_settings: this.memorySettings 
      }),
    });
    const json = await res.json();
    if (json.success) {
      this.isSlackBotRunning = true;
      showNotification('Slack bot started', 'success');
    } else {
      showNotification(`Startup failed: ${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('Network error or server not responding', 'error');
  } finally {
    this.isSlackStarting = false;
  }
},
async stopSlackBot() {
  this.isSlackStopping = true;
  try {
    const res = await fetch('/stop_slack_bot', { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      this.isSlackBotRunning = false;
      showNotification('Slack bot stopped', 'success');
    } else {
      showNotification(`Stop failed: ${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('Network error', 'error');
  } finally {
    this.isSlackStopping = false;
  }
},
async reloadSlackBot() {
  this.isSlackReloading = true;
  try {
    const res = await fetch('/reload_slack_bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...this.slackBotConfig,
        memory_settings: this.memorySettings
      }),
    });
    const json = await res.json();
    if (json.success) {
      showNotification('Slack bot reloaded', 'success');
    } else {
      showNotification(`Reload failed: ${json.message}`, 'error');
    }
  } catch (e) {
    showNotification('Network error', 'error');
  } finally {
    this.isSlackReloading = false;
  }
},
async checkSlackBotStatus() {
  try {
    const res = await fetch('/slack_bot_status');
    const st = await res.json();
    this.isSlackBotRunning = st.is_running;
  } catch (e) {
    console.error('Slack status check failed', e);
  }
},
handleCreateSlackSeparator(val) {
  this.slackBotConfig.separators.push(val);
},


    async handleSeparatorChange(val) {
      this.ttsSettings.separators = val.map(s => 
        s.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
      );
      await this.autoSaveSettings();
    },
    formatSeparator(s) {
      return s.replace(/\n/g, '\\n')
              .replace(/\t/g, '\\t')
              .replace(/\r/g, '\\r');
    },
    // Create separator handler
    async handleCreateSeparator(newSeparator) {
      const processed = this.escapeSeparator(newSeparator)
      if (!this.ttsSettings.separators.includes(processed)) {
        this.ttsSettings.separators.push(processed)
        await this.autoSaveSettings()
      }
    },

    // Handle Enter-key conflict
    handleEnter(e) {
      if (e.target.value) {
        e.stopPropagation()
      }
    },

    escapeSeparator(s) {
      return s.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
    },

    // One-click reset
    resetNewMemory() {
      this.newMemory = {
        id: null,
        name: '',
        infer:false,
        providerId: null,
        model: '',
        base_url: '',
        api_key: '',
        vendor: '',
        description: '',
        avatar: '',
        personality: '',
        mesExample: '',
        systemPrompt: '',
        firstMes: '',
        alternateGreetings: [],
        characterBook: [{ keysRaw: '', content: '' }]
      };
    },
    copyExistingMemoryData(selectedId) {
      const src = this.memories.find(m => m.id === selectedId);
      if (src) {
        /* Map old fields to new ones, using defaults for missing fields */
        this.newMemory = {
          id: null,
          name: src.name || '',
          infer: src.infer || false,
          providerId: src.providerId || null,
          model: src.model || '',
          base_url: src.base_url || '',
          api_key: src.api_key || '',
          vendor: src.vendor || '',

          /* Old -> new */
          description: src.basic_character || src.description || '',
          avatar: src.avatar || '',
          personality: src.personality || '',
          mesExample: src.mesExample || '',
          systemPrompt: src.systemPrompt || '',
          firstMes: src.firstMes || (Array.isArray(src.random) ? src.random[0]?.value : ''),
          alternateGreetings:
            Array.isArray(src.alternateGreetings)
              ? src.alternateGreetings
              : (src.random || []).slice(1).map(r => r.value),
          characterBook:
            Array.isArray(src.characterBook)
              ? src.characterBook
              : (src.lorebook || []).map(l => ({
                  keysRaw: l.name,
                  content: l.value
                }))  
        };
           if (this.newMemory.characterBook.length == 0 ){
              this.newMemory.characterBook = [{ keysRaw: '', content: '' }]
           }   
      } else {
        /* New: start with an empty template */
        this.resetNewMemory();
      }
    },
    colorBlend(color1, color2, ratio) {
        // Clamp ratio to 0-1
        ratio = Math.max(0, Math.min(1, ratio));
        
        // Parse hexadecimal color
        const parseHex = (hex) => {
          hex = hex.replace(/^#/, '');
          // Handle three-digit shorthand
          if (hex.length === 3) {
            hex = hex.split('').map(char => char + char).join('');
          }
          return {
            r: parseInt(hex.substring(0, 2), 16),
            g: parseInt(hex.substring(2, 4), 16),
            b: parseInt(hex.substring(4, 6), 16)
          };
        };

        // Convert to two-digit hex strings
        const toHex = (value) => {
          const hex = Math.round(value).toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        };

        const rgb1 = parseHex(color1);
        const rgb2 = parseHex(color2);

        // Calculate blended RGB values
        const r = rgb1.r * ratio + rgb2.r * (1 - ratio);
        const g = rgb1.g * ratio + rgb2.g * (1 - ratio);
        const b = rgb1.b * ratio + rgb2.b * (1 - ratio);

        // Combine into hexadecimal color
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      },
      toggleInputExpand() {
        this.isInputExpanded = !this.isInputExpanded
    },
    onChatInputFocus() {
      this.isChatInputActive = true;
    },
    // Defer textarea blur handling one frame so pill or dialog clicks can register
    onChatInputBlur() {
      setTimeout(() => {
        const active = document.activeElement;
        const wrappers = document.querySelectorAll('.unified-input-wrapper');
        for (const w of wrappers) {
          if (w.contains(active)) return;
        }
        this.isChatInputActive = false;
      }, 200);
    },
    checkMobile() {
      this.isMobile = window.innerWidth <= 768;
      this.isAssistantMode = window.innerWidth <= 350 && window.innerHeight <= 820;
      if (this.isMobile) {
        this.MoreButtonDict = this.smallMoreButtonDict;
      }
      else{
        this.MoreButtonDict = this.largeMoreButtonDict;
      }
      if (this.isAssistantMode){
        if(!this.isFixedWindow){
          this.isFixedWindow = true;
          if (isElectron){
            window.electronAPI.setAlwaysOnTop(this.isFixedWindow);
          }
        }
        
      }else{
        if(this.isFixedWindow){
          this.isFixedWindow = false;
          if (isElectron){
            window.electronAPI.setAlwaysOnTop(this.isFixedWindow);
          }
        }
      }
      if(this.isMobile) this.sidebarVisible = false;
    },
    // Add ComfyUI server
    addComfyUIServer() {
      this.comfyuiServers.push('http://localhost:8188')
      this.autoSaveSettings()
    },

    // Remove server
    removeComfyUIServer(index) {
      if (this.comfyuiServers.length > 1) {
        this.comfyuiServers.splice(index, 1)
        this.autoSaveSettings()
      }
    },

    // Connect server
    async connectComfyUI(index) {
      this.isConnecting = true
      try {
        const url = this.comfyuiServers[index]
        const response = await fetch(`${url}/history`, {
          method: 'HEAD',
          mode: 'cors'
        })
        if (response.ok) {
          this.activeComfyUIUrl = url
          showNotification('Connected to server')
        }
      } catch (e) {
        showNotification('Could not connect to ComfyUI server', 'error')
      }
      this.isConnecting = false
    },
    // Browse files
    browseWorkflowFile() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (event) => {
        const files = event.target.files;
        if (files.length > 0) {
          this.workflowFile = files[0];
          this.loadWorkflowFile(this.workflowFile); // Load after selection
        }
      };
      input.click();
    },
    // Remove file
    removeWorkflowFile() {
      this.workflowFile = null;
    },
    // Delete workflow
    async deleteWorkflow(filename) {
      try {
        const response = await fetch(`/delete_workflow/${filename}`, {
          method: 'DELETE',
        });
        const data = await response.json();
        if (data.success) {
          this.workflows = this.workflows.filter(file => file.unique_filename !== filename);
          await this.autoSaveSettings();
          showNotification('Deleted successfully');
        } else {
          this.workflows = this.workflows.filter(file => file.unique_filename !== filename);
          await this.autoSaveSettings();
          showNotification('Deletion failed', 'error');
        }
      } catch (error) {
        console.error('Delete failed:', error);
       showNotification('Deletion failed', 'error');
      }
    },
      // Handle file drop
  handleWorkflowDrop(event) {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      this.workflowFile = files[0];
      this.loadWorkflowFile(this.workflowFile); // Load workflow file to populate options
    }
  },
  
  // Load workflow file
  async loadWorkflowFile(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      const workflowJson = JSON.parse(event.target.result);
      this.populateInputOptions(workflowJson);
    };
    reader.readAsText(file);
  },

  // Populate input options
  populateInputOptions(workflowJson) {
    this.textInputOptions = [];
    this.imageInputOptions = [];
    this.seedInputOptions = [];
    
    for (const nodeId in workflowJson) {
      const node = workflowJson[nodeId];
      if (!node.inputs) continue;
      
      // Find text fields containing text, value or prompt
      const textInputKeys = Object.keys(node.inputs).filter(key => 
        (key.includes('text') || key.includes('value') || key.includes('prompt')) &&
        typeof node.inputs[key] === 'string' // Require string value
      );
      
      // Create option for each matching field
      textInputKeys.forEach(key => {
        this.textInputOptions.push({
          label: `${node._meta.title} - ${key} (ID: ${nodeId})`,
          value: { nodeId, inputField: key, id : `${nodeId}-${key}` },
        });
      });
      
      // Find image input fields
      if (node.class_type === 'LoadImage') {
        const imageKeys = Object.keys(node.inputs).filter(key => 
          key.includes('image') && 
          typeof node.inputs[key] === 'string' // Require string value
        );
        
        imageKeys.forEach(key => {
          this.imageInputOptions.push({
            label: `${node._meta.title} - ${key} (ID: ${nodeId})`,
            value: { nodeId, inputField: key, id : `${nodeId}-${key}` },
          });
        });
      }

      // Find seed input fields
      const seedInputKeys = Object.keys(node.inputs).filter(
        key => key.includes('seed') && typeof node.inputs[key] === 'number' // Require numeric value
      )
      seedInputKeys.forEach(key => {
        this.seedInputOptions.push({
          label: `${node._meta.title} - ${key} (ID: ${nodeId})`,
          value: { nodeId, inputField: key, id : `${nodeId}-${key}` },
        });
      })
    }
  },

    // Upload file
    async uploadWorkflow() {
      if (!this.workflowFile) return;

      const formData = new FormData();
      formData.append('file', this.workflowFile);

      // Record selected input positions
      const workflowData = {
        textInput: this.selectedTextInput,
        textInput2: this.selectedTextInput2,
        imageInput: this.selectedImageInput,
        imageInput2: this.selectedImageInput2,
        seedInput: this.selectedSeedInput,
        seedInput2: this.selectedSeedInput2,
        description: this.workflowDescription,
      };

      // Send JSON as an ordinary form field
      formData.append('workflow_data', JSON.stringify(workflowData));

      try {
        const response = await fetch(`/add_workflow`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) { // Check response status
          const errorText = await response.text(); // Read error text
          console.error("Server error:", errorText); // Log error
          throw new Error("Server error");
        }

        const data = await response.json();
        if (data.success) {
          this.workflows.push(data.file);
          this.showWorkflowUploadDialog = false;
          this.workflowFile = null;
          this.selectedTextInput = null; // Reset selection
          this.selectedImageInput = null; // Reset selection
          this.selectedTextInput2 = null; // Reset selection
          this.selectedImageInput2 = null; // Reset selection
          this.selectedSeedInput = null; // Reset selection
          this.selectedSeedInput2 = null; // Reset selection
          this.workflowDescription = ''; // Clear description
          await this.autoSaveSettings();
          showNotification('Upload successful');
        } else {
          showNotification('Upload failed', 'error');
        }
      } catch (error) {
        console.error('Upload failed:', error);
        showNotification('Upload failed', 'error');
      }
    },
    cancelWorkflowUpload() {
      this.showWorkflowUploadDialog = false;
      this.workflowFile = null;
      this.selectedTextInput = null; // Reset selection
      this.selectedImageInput = null; // Reset selection
      this.selectedTextInput2 = null; // Reset selection
      this.selectedImageInput2 = null; // Reset selection
      this.selectedSeedInput = null; // Reset selection
      this.selectedSeedInput2 = null; // Reset selection
      this.workflowDescription = ''; // Clear description
    },
    async deleteVideo(video) {
      this.videoFiles = this.videoFiles.filter(i => i !== video);
      await this.autoSaveSettings();
      fileName = video.unique_filename
      try {
        // Send request to /delete_file
        const response = await fetch(`/delete_file`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: fileName })
        });
        // Handle response
        if (response.ok) {
          console.log('File deleted successfully');
          showNotification(this.t('fileDeleted'), 'success');
        }
      } catch (error) {
        console.error('Error:', error);
        showNotification(this.t('fileDeleteFailed'), 'error');
      }
    },

    goToURL(provider) {
        if (provider.vendor === 'custom') {
          url = provider.url;
          // Remove trailing /v1 from URL
          if (url.endsWith('/v1')) {
            url = url.slice(0, -3);
          }
        }
        else if (provider.vendor === 'customAnthropic' || provider.vendor === 'OpenAIResponses'){
          url = provider.url;
        }
        else {
          url = this.vendorAPIpage[provider.vendor];
        }
        if (isElectron) {
          window.electronAPI.openExternal(url);
        } else {
          window.open(url, '_blank');
        }
    },
    goToMCPURL(value) {
        url = this.MCPpage[value]
        if (isElectron) {
          window.electronAPI.openExternal(url);
        } else {
          window.open(url, '_blank');
        }
    },
    goToPromptURL(value) {
        url = this.promptPage[value]
        if (isElectron) {
          window.electronAPI.openExternal(url);
        } else {
          window.open(url, '_blank');
        }
    },
    goToCardURL(value) {
        url = this.cardPage[value]
        if (isElectron) {
          window.electronAPI.openExternal(url);
        } else {
          window.open(url, '_blank');
        }
    },
    handleBeforeUpload(file) {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        this.uploadedStickers.push({
          uid: file.uid,
          url: reader.result,
          description: "",
          file: file
        })
      }
      return false // Prevent automatic upload
    },

    handleStickerRemove(file) {
      this.uploadedStickers = this.uploadedStickers.filter(f => f.uid !== file.uid)
    },

    async createStickerPack() {
      try {
        // Validate input
        if (!this.newStickerPack.name || this.uploadedStickers.length === 0) {
          showNotification(this.t('fillAllFields'), 'warning');
          return;
        }
        

        // Create FormData
        const formData = new FormData();
        
        // Add sticker pack name
        formData.append('pack_name', this.newStickerPack.name);
        
        // Add all expression descriptions
        this.uploadedStickers.forEach(sticker => {
          formData.append('descriptions', sticker.description);
        });
        
        // Add all expression files
        this.uploadedStickers.forEach(sticker => {
          formData.append('files', sticker.file);
        });

        // Send request
        const response = await fetch(`/create_sticker_pack`, {
          method: 'POST',
          body: formData
        });
        
        // Handle response
        if (!response.ok) {
          const errorData = await response.json();
          console.error("Server error details:", errorData);
          
          let errorMsg = this.t('uploadFailed');
          if (errorData.detail) {
            if (typeof errorData.detail === 'string') {
              errorMsg = errorData.detail;
            } else if (errorData.detail[0]?.msg) {
              errorMsg = errorData.detail[0].msg;
            }
          }
          
          throw new Error(errorMsg);
        }

        const data = await response.json();
        if (data.success) {
          // Update frontend state
          this.stickerPacks.push({
            id: data.id,
            name: data.name,
            stickers: data.stickers,
            cover: data.cover,
            enabled: true
          });
          
          this.imageFiles = [...this.imageFiles, ...data.imageFiles];
          this.resetStickerForm();
          await this.autoSaveSettings();
          
          showNotification(this.t('stickerPackCreated'));
          this.showStickerDialog = false;
        } else {
          showNotification(data.message || this.t('createFailed'), 'error');
          this.showStickerDialog = false;
        }
      } catch (error) {
        console.error('Creation failed:', error);
        showNotification(
          error.message || this.t('createFailed'), 
          'error'
        );
        this.showStickerDialog = false;
      }
    },

    deleteStickerPack(stickerPack) {
      this.stickerPacks = this.stickerPacks.filter(pack => pack.id !== stickerPack.id);
      this.autoSaveSettings();
      showNotification(this.t('stickerPackDeleted'));
    },
    cancelStickerUpload() {
      this.showStickerDialog = false;
      this.resetStickerForm();
    },

    resetStickerForm() {
      this.newStickerPack = {
        name: '',
        stickers: [],
      };
      this.uploadedStickers = [];
    },
    handlePictureCardPreview(file) {
      this.imageUrl = file.url || URL.createObjectURL(file.raw)
      this.dialogVisible = true
    },
    downloadMemory(memory) {
      // Export only SillyTavern V3 fields and exclude sensitive information
      const card = {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        name: memory.name,
        description: memory.description || '',
        avatar: memory.avatar || '',
        personality: memory.personality || '',
        mes_example: memory.mesExample || '',
        first_mes: memory.firstMes || '',
        system_prompt: memory.systemPrompt || '',
        alternate_greetings: Array.isArray(memory.alternateGreetings)
          ? memory.alternateGreetings.filter(Boolean)
          : [],
        character_book: {
          name: memory.name,
          entries: Array.isArray(memory.characterBook)
            ? memory.characterBook
                .filter(e => e.keysRaw?.trim() && e.content?.trim())
                .map((e, idx) => ({
                  id: idx,
                  keys: e.keysRaw
                    .split(/\r?\n/)
                    .map(k => k.trim())
                    .filter(Boolean),
                  secondary_keys: [],
                  content: e.content,
                  comment: '',
                  constant: false,
                  selective: true,
                  insertion_order: 100,
                  enabled: true,
                  position: 'before_char',
                  use_regex: true,
                  extensions: {}
                }))
            : []
        }
        // Fill other fields such as avatar, tags and scenario as needed
      };

      const blob = new Blob([JSON.stringify(card, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${memory.name}_v3.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    changeMemory() {
      if (this.memorySettings.is_memory){
        // Look up selectedMemory in memories
        let curMemory = this.memories.find(memory => memory.id === this.memorySettings.selectedMemory);
        this.firstMes = curMemory.firstMes;
        this.alternateGreetings= curMemory.alternateGreetings;
      }
      else{
        this.firstMes = '';
        this.alternateGreetings = [];
      }
      this.randomGreetings();
      this.autoSaveSettings(); // Save settings
    },
    randomGreetings() {
      let greetings = [this.firstMes, ...this.alternateGreetings];
      // Filter empty strings
      greetings = greetings.filter(greeting => greeting.trim() !== '');
      // Replace greeting user placeholders with this.memorySettings.userName
      greetings = greetings.map(greeting => greeting.replace(/{{user}}/g, this.memorySettings.userName));
      // Look up selectedMemory in memories
      let curMemory = this.memories.find(memory => memory.id === this.memorySettings.selectedMemory);
      // Replace greeting character placeholders with curMemory.name
      greetings = greetings.map(greeting => greeting.replace(/{{char}}/g, curMemory.name));
      if (greetings.length > 0) {
        let randomIndex = Math.floor(Math.random() * greetings.length);
        // Immediately insert random greeting into messages
        // Replace an existing second-message greeting or insert after first message
        if (this.messages.length > 1 && this.messages[1].role === 'assistant') {
          this.messages[1].content = greetings[randomIndex];
          this.messages[1].pure_content = greetings[randomIndex];
        } else {
          this.messages.splice(1, 0, {
            role: 'assistant',
            content: greetings[randomIndex],
            pure_content: greetings[randomIndex],
          });
        }
      } 
      else{
        // Remove an existing second-message greeting
        if (this.messages.length > 1 && this.messages[1].role === 'assistant') {
          this.messages.splice(1, 1);
        }
      }
    },
    browseJsonFile() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.png';          // Accept PNG in addition to JSON
      input.onchange = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        if (file.name.toLowerCase().endsWith('.png')) {
          this.handlePngAsJson(file);        // PNG branch
        } else {
          this.handleFileUpload(file);       // Existing JSON branch
        }
      };
      input.click();
    },

    handleJsonDrop(event) {
      const file = event.dataTransfer.files[0];
      if (!file) return;
      const isPng = file.type === 'image/png' ||
                    file.name.toLowerCase().endsWith('.png');
      const isJson = file.type === 'application/json' ||
                    file.name.toLowerCase().endsWith('.json');

      if (isPng) {
        this.handlePngAsJson(file);
      } else if (isJson) {
        this.handleFileUpload(file);
      } else {
        showNotification('Please upload a valid JSON or PNG character card.', 'error');
      }
    },

    async handlePngAsJson(file) {
      // 1. Upload PNG as an image to get its URL
      const formData = new FormData();
      formData.append('files', file);   // Field name must match /load_file

      let imageUrl;
      try {
        const up = await fetch('/load_file', { method: 'POST', body: formData });
        if (!up.ok) throw new Error('upload failed');
        const res = await up.json();
        if (!res.success || !res.fileLinks || !res.fileLinks[0])
          throw new Error('no url returned');
        imageUrl = res.fileLinks[0].path;          // Full URL returned by backend
        // Optionally add image to imageFiles to synchronize UI
        this.imageFiles = [...this.imageFiles, ...res.imageFiles];
      } catch (e) {
        console.error(e);
        showNotification('PNG upload failed', 'error');
        return;
      }

      // 2. Extract embedded JSON
      const jsonText = await this.extractJsonFromPng(file);
      if (!jsonText) return;   // Notification already shown internally

      // 3. Replace avatar with uploaded URL
      let jsonData;
      try {
        jsonData = JSON.parse(jsonText);
      } catch {
        showNotification('Invalid JSON inside PNG', 'error');
        return;
      }
      // Support V2 and V3
      const target = jsonData.data || jsonData;
      target.avatar = imageUrl;   // Overwrite avatar

      // 4. Populate form using existing logic
      this.importMemoryData(jsonData);
      this.jsonFile = file;       // Keep file for the remove button
      showNotification('Character card imported from PNG', 'success');
    },

    async extractJsonFromPng(file) {
      const buffer = await file.arrayBuffer();
      const png = new Uint8Array(buffer);
      const sign = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
      if (!sign.every((b, i) => b === png[i])) {
        showNotification('Not a valid PNG file', 'error');
        return null;
      }

      let pos = 8;
      const view = new DataView(buffer);
      let jsonText = null;

      while (pos < png.length) {
        const len  = view.getUint32(pos);
        const type = String.fromCharCode(...png.slice(pos + 4, pos + 8));
        const start = pos + 8;
        const end   = start + len;

        if (type === 'tEXt') {
          const data = png.slice(start, end);
          const zero = data.indexOf(0);
          if (zero > 0) {
            const key = new TextDecoder().decode(data.slice(0, zero)).toLowerCase();
            if (key === 'chara' || key === 'ccv3') {
              const b64 = new TextDecoder().decode(data.slice(zero + 1));
              try {
                jsonText = new TextDecoder().decode(
                  Uint8Array.from(atob(b64), c => c.charCodeAt(0))
                );
                if (key === 'ccv3') break;
              } catch {}
            }
          }
        }
        if (type === 'IEND') break;
        pos = end + 4; // Skip CRC
      }

      if (!jsonText) showNotification('No character data found in PNG', 'error');
      return jsonText;
    },


    // Open file picker
    triggerAvatarUpload() {
      this.$refs.avatarInput.click();
    },

    // Handle file upload
    async handleAvatarUpload(event) {
      const file = event.target.files[0];
      if (!file) return;

      // Reset input so reselecting the same file triggers change
      event.target.value = '';

      const formData = new FormData();
      // files must match the backend /load_file endpoint
      formData.append('files', file, file.name);

      try {
        // Optional loading animation
        // const loading = this.$loading({ lock: true, text: 'Uploading...' });

        const response = await fetch('/load_file', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();
        
        // loading.close(); // Close loading animation

        if (data.success && data.fileLinks && data.fileLinks.length > 0) {
          // Get complete URL from backend
          const uploadedUrl = data.fileLinks[0].path;
          
          // Assign to newMemory.avatar
          this.newMemory.avatar = uploadedUrl;
          
          // Use global notification if available
          showNotification(this.t('uploadSuccess') || 'Upload successful', 'success');
        } else {
          showNotification(this.t('uploadFailed') || 'Upload failed', 'error');
        }
      } catch (error) {
        console.error('Avatar upload error:', error);
        showNotification(error.message || 'Upload error', 'error');
      }
    },


    // Open background image picker
    triggerBgUpload() {
      if (this.$refs.bgImageInput) {
        this.$refs.bgImageInput.click();
      }
    },

    // Handle background image upload
    async handleBgUpload(event) {
      const file = event.target.files[0];
      if (!file) return;

      // Reset input so reselecting the same file triggers change
      event.target.value = '';

      const formData = new FormData();
      // files must match backend /load_file
      formData.append('files', file, file.name);

      try {
        const response = await fetch('/load_file', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();
        
        if (data.success && data.fileLinks && data.fileLinks.length > 0) {
          // Assign backend URL to backgroundURL
          const uploadedUrl = data.fileLinks[0].path;
          this.systemSettings.backgroundURL = uploadedUrl;
          
          // Autosave configuration
          this.autoSaveSettings();
          
          showNotification(this.t('uploadSuccess') || 'Upload successful', 'success');
        } else {
          showNotification(this.t('uploadFailed') || 'Upload failed', 'error');
        }
      } catch (error) {
        console.error('Background upload error:', error);
        showNotification(error.message || 'Upload error', 'error');
      }
    },

    clearBgImage() {
      this.systemSettings.backgroundURL = '';
      if (typeof this.autoSaveSettings === 'function') {
        this.autoSaveSettings();
      }
    },

    handleFileUpload(file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const jsonData = JSON.parse(event.target.result); // Parse JSON
          this.importMemoryData(jsonData); // Call importer
          this.jsonFile = file; // Keep file metadata
        } catch (error) {
          showNotification('Invalid JSON file.', 'error'); // Error notification
        }
      };

      reader.readAsText(file); // Read file contents
    },

    _sanitizeCardText(raw, maxLen = 100 * 1024) {
      if (typeof raw !== 'string') return raw || '';
      // Remove control characters that break JSON/API transport; retain newline, carriage return and tab
      let cleaned = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      if (cleaned.length > maxLen) {
        console.warn("[_sanitizeCardText] Field length " + cleaned.length + " exceeds " + maxLen + "; truncated");
        cleaned = cleaned.substring(0, maxLen);
      }
      return cleaned;
    },

    importMemoryData(jsonData) {
      // Extract data consistently from V2/V3
      const data = jsonData.data || jsonData;
      const s = this._sanitizeCardText.bind(this);

      this.newMemory = {
        ...this.newMemory,                      // Keep existing fields such as providerId
        name: s(data.name).substring(0, 512),   // Limit name to 512 characters
        description: s(data.description),
        avatar: data.avatar || '',
        personality: s(data.personality),
        mesExample: s(data.mes_example),
        systemPrompt: s(data.system_prompt),
        firstMes: s(data.first_mes),
        alternateGreetings: Array.isArray(data.alternate_greetings)
          ? data.alternate_greetings.map(g => s(g))
          : [''],
        characterBook:
          Array.isArray(data.character_book?.entries) &&
          data.character_book.entries.length
            ? data.character_book.entries.map(e => ({
                keysRaw: s((e.keys || []).join('\n')),
                content: s(e.content)
              }))
            : [{ keysRaw: '', content: '' }]
      };
    },

    removeJsonFile() {
      this.jsonFile = null; // Clear file
    },
    // Initialize ASR WebSocket with Web Speech API support
    async initASRWebSocket() {
      if (this.asrSettings.engine === 'webSpeech') return;
      
      // Clean up existing or connecting socket first
      if (this.asrWs) {
        this.asrWs.onclose = null;
        this.asrWs.close();
        this.asrWs = null;
      }

      const ws_protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws_url = `${ws_protocol}//${window.location.host}/ws/asr`;

      console.log('Initializing ASR WebSocket...');
      this.asrWs = new WebSocket(ws_url);
      
      this.asrWs.onopen = () => {
        if (this.asrWs && this.asrWs.readyState === WebSocket.OPEN) {
          console.log('ASR WebSocket connection established');
          this.asrWs.send(JSON.stringify({ type: 'init' }));
        }
      };

      this.asrWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleASRResult(data);
        } catch (e) {
          console.error('Invalid JSON from ASR server:', event.data);
        }
      };

      this.asrWs.onclose = (event) => {
        // Reconnect only if ASR remains enabled and the socket was not manually destroyed
        if (this.asrSettings.enabled && this.asrWs !== null) {
          console.log('ASR WebSocket unexpected closed, reconnecting in 3s...');
          setTimeout(() => {
            if (this.asrSettings.enabled) this.initASRWebSocket();
          }, 3000);
        }
      };

      this.asrWs.onerror = (error) => {
        console.error('ASR WebSocket error observed');
      };
    },

    // Initialize Web Speech API without starting it automatically
    initWebSpeechAPI() {
      if(isElectron){
        showNotification(this.t('webSpeechNotSupportedInElectron'), 'error');
        this.asrSettings.enabled = false;
        this.autoSaveSettings();
        return false;
      }

      // Check browser support for Web Speech API
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showNotification(this.t('webSpeechNotSupported'), 'error');
        this.asrSettings.enabled = false;
        return false;
      }

      // Create speech recognition object
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();

      // Configure recognition parameters
      this.recognition.continuous = true; // Use continuous recognition with VAD control
      this.recognition.interimResults = true;
      if (this.asrSettings.webSpeechLanguage != 'auto'){
        this.recognition.lang = this.asrSettings.webSpeechLanguage;
      }
      // Handle recognition results
      this.recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        // Handle interim results
        if (interimTranscript) {
          this.handleASRResult({
            type: 'transcription',
            text: interimTranscript,
            is_final: false
          });
        }

        // Handle final results
        if (finalTranscript) {
          this.handleASRResult({
            type: 'transcription',
            text: finalTranscript,
            is_final: true
          });
        }
      };

      // Error handling
      this.recognition.onerror = (event) => {
        console.error('Web Speech API error:', event.error);
        let errorMessage = null;
        
        switch (event.error) {
          case 'no-speech':
            errorMessage = null;
            break;
          case 'audio-capture':
            errorMessage = this.t('microphoneError');
            break;
          case 'not-allowed':
            errorMessage = this.t('micPermissionDenied');
            break;
          case 'network':
            errorMessage = this.t('networkError');
            break;
        }
        if (errorMessage) {
          showNotification(errorMessage, 'error');
        }
        
        // Reset recognition state
        this.isWebSpeechRecognizing = false;
      };

      // Handle recognition end
      this.recognition.onend = () => {
        console.log('Web Speech API recognition ended');
        this.isWebSpeechRecognizing = false;
        // VAD controls restart
      };

      // Handle recognition start
      this.recognition.onstart = () => {
        console.log('Web Speech API recognition started');
        this.isWebSpeechRecognizing = true;
      };

      return true;
    },
    openWakeWindow() {
      this.withinWakeWindow = true;
      this.wakeWindowTimer = setTimeout(() => {
        this.withinWakeWindow = false;
      }, 30_000);
    },

    /* Refresh the 30-second window after successful interaction */
    resetWakeWindow() {
      clearTimeout(this.wakeWindowTimer);
      this.openWakeWindow();
    },

    /* Clear timer, e.g. when destroying the component */
    clearWakeWindow() {
      clearTimeout(this.wakeWindowTimer);
      this.withinWakeWindow = false;
    },

    // Shared ASR result handler
    handleASRResult(data) {
      if (data.type === 'transcription') {
        const lastMessage = this.messages[this.messages.length - 1];
        if (!this.ttsSettings.enabledInterruption && (this.ttsSettings.enabled||this.settings.enableOmniTTS)) {
          // Ignore ASR while TTS plays if interruption is disabled
          if(this.TTSrunning){
            if ((!lastMessage || (lastMessage?.currentChunk ?? 0) >= (lastMessage?.ttsChunks?.length ?? 0)) && !this.isTyping) {
              console.log('All audio chunks played');
              lastMessage.currentChunk = 0;
              this.TTSrunning = false;
              this.cur_audioDatas = [];
              // Notify VRM that audio playback ended
              this.sendTTSStatusToVRM('allChunksCompleted', {});
            }
            else{
              console.log('Audio chunks still playing');
              return;
            }
          }
        }
        else if (this.ttsSettings.enabledInterruption && this.ttsSettings.enabled) {
            console.log('All audio chunks played');
            lastMessage.currentChunk = 0;
            this.TTSrunning = false;
            this.cur_audioDatas = [];
            // Notify VRM that audio playback ended
            this.sendTTSStatusToVRM('allChunksCompleted', {});
        }
        else if(this.settings.enableOmniTTS && this.ttsSettings.enabledInterruption){
            this.stopAllAudioPlayback();
            this.sendTTSStatusToVRM('allChunksCompleted', {});
        }
        if (data.is_final) {
          // Final result
          if (this.userInputBuffer.length > 0) {
            // Replace the final userInputBuffer in userInput with data.text
            this.userInput = this.userInput.slice(0, -this.userInputBuffer.length) + data.text;
            this.userInputBuffer = '';
          } else {
            // Append directly if there is no interim result
            this.userInput += data.text;
            this.userInputBuffer = '';
          }
          
          if (this.isPttMode || this.waitingForPttResult) {
            console.log("PTT recognition finished; submitting:", data.text);
            this.sendMessage(); 
            this.userInput = ''; // Clear after submission
            this.waitingForPttResult = false; // Reset flag
            return;
          }

          // Handle according to interaction mode
          if (this.asrSettings.interactionMethod == "auto") {
            if (this.ttsSettings.enabledInterruption) {
              this.sendMessage();
            } else if (!this.TTSrunning ||  !this.ttsSettings.enabled) {
              this.sendMessage();
            }
          }
          
          if (this.asrSettings.interactionMethod == "wakeWord") {
            const lowerInput = this.userInput.toLowerCase();
            const hasWakeWord = lowerInput.includes(this.asrSettings.wakeWord.toLowerCase());

            /* 1. Submit directly within the 30-second wake-word-free window */
            if (this.withinWakeWindow) {
              this.sendMessage();
              this.resetWakeWindow();          // Refresh the 30-second window
              return;
            }

            /* 2. Otherwise require wake word */
            if (hasWakeWord) {
              this.sendMessage();
              this.openWakeWindow();           // Open the 30-second wake-word-free window
            } else {
              this.userInput = '';             // No wake word; clear input
            }
          }
          
          if (this.asrSettings.interactionMethod == "wakeWordAndEndWord") {
            const userInputLower = this.userInput.toLowerCase();
            const wakeWordLower = this.asrSettings.wakeWord.toLowerCase();
            const endWordLower = this.asrSettings.endWord.toLowerCase();
            
            // Check for stop word
            if (userInputLower.includes(endWordLower)) {
              this.inAutoMode = false;
              console.log('End word detected, exiting auto mode');
              showNotification(this.t('endWordDetected'));
              // Either submit the stop-word message or clear without submission
              this.userInput = '';
            }
            // Check for wake word
            else if (userInputLower.includes(wakeWordLower)) {
              this.inAutoMode = true;
              console.log('ake word detected, entering auto mode');
              // Submit message containing wake word
              if (this.ttsSettings.enabledInterruption) {
                this.sendMessage();
              } else if (!this.TTSrunning ||  !this.ttsSettings.enabled) {
                this.sendMessage();
              }
            }
            // Submit all messages in automatic mode
            else if (this.inAutoMode) {
              if (this.ttsSettings.enabledInterruption) {
                this.sendMessage();
              } else if (!this.TTSrunning ||  !this.ttsSettings.enabled) {
                this.sendMessage();
              }
            }
            else{
              this.userInput = '';             // No wake word; clear input
            }
          }
        } else {
          if (this.asrSettings.engine === 'webSpeech'){
            this.userInput = data.text;
            this.userInputBuffer = data.text;
          }else {
            // Interim result
            this.userInput += data.text;
            this.userInputBuffer += data.text;
          }

        }
      } else if (data.type === 'error') {
        console.error('ASR error:', data.message);
        showNotification(this.t('transcriptionFailed'), 'error');
      } else if (data.type === 'init_response') {
        if (data.status === 'ready') {
          
        }
      }
    },

    // Toggle ASR
    async toggleASR() {
      this.asrSettings.enabled = !this.asrSettings.enabled;
      this.autoSaveSettings();
      if (this.asrSettings.enabled === true && this.asrSettings.engine === 'sherpa'){
        if (!this.sherpaModelExists){
          showNotification(this.t('autoDownloadModel'), 'info');
          this.asrSettings.enabled = false;
          let source = await this.getAutoSource();
          await this.sherpaDownload(source);
          this.autoSaveSettings();
          return;
        }
      }
      if (this.asrSettings.enabled) {
        await this.startASR();
      } else {
        this.stopASR();
      }
    },

    // Handle ASR settings changes
    async handleASRchange() {
      // Return during startup to prevent duplicate clicks
      if (this.isStartingASR) return;
      
      // Stop completely first
      await this.stopASR(); 
      if (this.asrSettings.enabled === true && this.asrSettings.engine === 'sherpa'){
        if (!this.sherpaModelExists){
          showNotification(this.t('autoDownloadModel'), 'info');
          this.asrSettings.enabled = false;
          let source = await this.getAutoSource();
          await this.sherpaDownload(source);
          this.autoSaveSettings();
          return;
        }
      }

      if (this.asrSettings.enabled) {
        // Allow 200 ms for resource cleanup
        await new Promise(resolve => setTimeout(resolve, 200));
        await this.startASR();
      }

      this.autoSaveSettings();
    },

    // Start ASR
    async startASR() {
      if (!this.asrSettings.enabled) return;
      if (this.asrSettings.interactionMethod === 'globalKeyTriggered' || this.asrSettings.interactionMethod === 'keyTriggered') return;
      
      // Acquire startup lock
      if (this.isStartingASR) return;
      this.isStartingASR = true;

      try {
        // 1. Acquire shared stream
        if (!this.mediaStream) {
          this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          });
        }

        // 2. Initialize VAD
        await this.initVAD();

        // 3. Initialize engine
        if (this.asrSettings.engine === 'webSpeech') {
          this.initWebSpeechAPI();
        } else {
          // Ensure old connection is closed before creating another
          await this.initASRWebSocket();
        }

        if (this.vad) {
          await this.vad.start();
        }
        
        this.isRecording = true;
      } catch (error) {
        console.error('Start ASR Error:', error);
        this.stopASR();
      } finally {
        // Release startup lock
        this.isStartingASR = false;
      }
    },

    // Stop ASR
    async stopASR() {
      console.log('Stopping ASR...');
      this.isRecording = false;
      this.isStartingASR = false;

      // 1. Close WebSocket after removing listeners
      if (this.asrWs) {
        this.asrWs.onclose = null; // Remove listener to prevent automatic reconnect loops
        this.asrWs.onerror = null;
        this.asrWs.onmessage = null;
        this.asrWs.onopen = null;
        if (this.asrWs.readyState !== WebSocket.CLOSED) {
          this.asrWs.close();
        }
        this.asrWs = null;
      }

      // 2. Stop Web Speech
      if (this.recognition) {
        try {
          this.recognition.onend = null;
          this.recognition.onerror = null;
          this.recognition.abort();
        } catch (e) {}
        this.recognition = null;
        this.isWebSpeechRecognizing = false;
      }

      // 3. Stop VAD
      if (this.vad) {
        try {
          this.vad.pause();
          if (this.vad.destroy) await this.vad.destroy();
        } catch (e) {}
        this.vad = null;
      }

      // 4. Release microphone
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => {
          track.stop();
        });
        this.mediaStream = null;
      }

      // 5. Release audio context
      if (this.audioContext) {
        try {
          await this.audioContext.close();
        } catch (e) {}
        this.audioContext = null;
      }
      
      this.ASRrunning = false;
    },

    // Initialize VAD for Web Speech and other modes
    async initVAD() {
      if (!this.mediaStream) return;

      const min_probabilities = this.asrSettings.engine === 'webSpeech' ? 0.7 : 0.2;

      this.vad = await vad.MicVAD.new({
        stream: this.mediaStream,
        preSpeechPadFrames: 10,
        onSpeechStart: () => {
          this.ASRrunning = true;
          this.handleSpeechStart();
        },
        onFrameProcessed: (probabilities, frame) => {
          if (probabilities["isSpeech"] > min_probabilities) {
            // Interruption handling
            if (this.ttsSettings.enabledInterruption) {
              this.stopAllAudioPlayback();
              this.stopGenerate();
              this.sendTTSStatusToVRM('stopSpeaking', {});
            }

            const anyPlaying = this.messages.some(m => m._currentAudio && !m._currentAudio.paused);
            if (!anyPlaying) {
              if (this.asrSettings.engine === 'webSpeech') {
                this.handleWebSpeechFrameProcessed();
              } else {
                this.handleFrameProcessed(frame);
              }
            }
          }
        },
        onSpeechEnd: (audio) => {
          this.ASRrunning = false;
          if (this.asrSettings.engine === 'webSpeech') {
            this.handleWebSpeechEnd();
          } else {
            this.handleSpeechEnd(audio);
          }
        },
      });
    },

    handleWebSpeechSpeechStart() {
      console.log('VAD detected speech start for Web Speech API');
      if (!this.isWebSpeechRecognizing && this.recognition) {
        try {
          this.recognition.start();
        } catch (error) {
          // Ignore already-started errors
        }
      }
    },

    async handleFrameProcessed(frame) {
      if (!frame || !(frame instanceof Float32Array)) return;

      // Never send data unless the connection is OPEN
      if (!this.asrWs || this.asrWs.readyState !== WebSocket.OPEN) {
        return;
      }

      try {
        const int16Pcm = new Int16Array(frame.length);
        for (let i = 0; i < frame.length; i++) {
          int16Pcm[i] = Math.max(-32768, Math.min(32767, frame[i] * 32767));
        }

        const base64Audio = btoa(
          String.fromCharCode(...new Uint8Array(int16Pcm.buffer))
        );

        this.asrWs.send(JSON.stringify({
          type: 'audio_stream',
          id: this.currentTranscriptionId,
          audio: base64Audio,
          format: 'pcm',
          sample_rate: 16000
        }));
      } catch (e) {
        // A send failure may mean the connection just closed
        console.warn('Failed to send audio frame');
      }
    },

    handleWebSpeechEnd() {
      console.log('VAD detected speech end for Web Speech API');
      if (this.isWebSpeechRecognizing && this.recognition) {
        try {
          this.recognition.stop();
        } catch (error) {
          console.error('Failed to stop Web Speech API:', error);
        }
      }
    },


    // Start recording in both modes
    async startRecording() {
      try {
        // Request microphone permission
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Initialize audio context
        this.audioContext = new AudioContext();
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        
        // Set VAD parameters
        this.vad.start();
        
        this.isRecording = true;
      } catch (error) {
        console.error('Error starting recording:', error);
        this.asrSettings.enabled = false;
        showNotification(this.t('micPermissionDenied'), 'error');
      }
    },

    // Stop recording in both modes
    stopRecording() {
      if (this.vad) {
        this.vad.pause();
      }
      
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }
      
      if (this.audioContext) {
        this.audioContext.close();
        this.audioContext = null;
      }
      
      this.isRecording = false;
    },
    // Shared speech-start handler

    async handleSpeechStart() {
      if (this.asrSettings.engine === 'webSpeech') {
        this.handleWebSpeechSpeechStart();
      } else {
        if (!this.asrWs || this.asrWs.readyState !== WebSocket.OPEN) return;
        
        this.currentTranscriptionId = uuid.v4();
        this.asrWs.send(JSON.stringify({
          type: 'audio_start',
          id: this.currentTranscriptionId,
        }));
      }
    },

    async handleFrameProcessed(frame) {
      if (!frame || !(frame instanceof Float32Array)) return;

      // Check WebSocket state before sending
      if (!this.asrWs || this.asrWs.readyState !== WebSocket.OPEN) {
        return;
      }

      try {
        const int16Pcm = new Int16Array(frame.length);
        for (let i = 0; i < frame.length; i++) {
          int16Pcm[i] = Math.max(-32768, Math.min(32767, frame[i] * 32767));
        }

        const base64Audio = btoa(
          String.fromCharCode(...new Uint8Array(int16Pcm.buffer))
        );

        this.asrWs.send(JSON.stringify({
          type: 'audio_stream',
          id: this.currentTranscriptionId,
          audio: base64Audio,
          format: 'pcm',
          sample_rate: 16000 
        }));
      } catch (e) {
        console.error('Frame processing error:', e);
      }
    },

    async handleSpeechEnd(audio) {
      // Speech-end handling
      if (!this.asrWs || this.asrWs.readyState !== WebSocket.OPEN) return;
      
        // Send complete audio in non-streaming mode
        // Convert audio to WAV
        const wavFile = await this.audioToWav(audio);
        
        // Encode WAV as Base64
        const reader = new FileReader();
        reader.readAsDataURL(wavFile);
        reader.onloadend = () => {
          const base64data = reader.result.split(',')[1]; // Strip data URL prefix
          
          // Send complete audio
          this.asrWs.send(JSON.stringify({
            type: 'audio_complete',
            id: this.currentTranscriptionId,
            audio: base64data,
            format: 'wav'
          }));
        };
    },
  // 1. Press: start recording
  async handlePttPress(event) {
    this.stopAllAudioPlayback(); // Stop all current audio playback
    this.TTSrunning = false; // Stop current TTS
    // Prevent default event to avoid _withMods errors
    if (event && event.preventDefault) {
      if (event.type !== 'touchstart') {
        event.preventDefault();
      }
    }

    if (this.isPttRecording || this.isProcessingPtt) return;
    this.isPttRecording = true;

    // ==========================================
    // Branch A: reuse Web Speech API initialization
    // ==========================================
    if (this.asrSettings.engine === 'webSpeech') {
      // Initialize recognition if needed
      if (!this.recognition) {
        const success = this.initWebSpeechAPI();
        if (!success) {
          this.isPttRecording = false;
          return;
        }
      }
      
      try {
        this.recognition.start();
        if (navigator.vibrate) navigator.vibrate(50);
      } catch (e) {
        // Handle already-started error
        console.warn("Web Speech already started:", e);
      }
      return; // Return without running MediaRecorder logic below
    }

    // ==========================================
    // Branch B: other binary-stream ASR modes (Sherpa/FunASR/OpenAI)
    // ==========================================
    this.audioChunks = []; // Reset audio chunk buffer

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.pttStream = stream;

      let options = { mimeType: 'audio/webm' };
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/mp4' }; // Safari compatibility
      }
      
      this.pttMediaRecorder = new MediaRecorder(stream, options);

      this.pttMediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.pttMediaRecorder.start();
      
      if (navigator.vibrate) navigator.vibrate(50);

    } catch (error) {
      console.error("PTT Start Error:", error);
      // Use showNotification if defined, otherwise alert
      if (typeof showNotification === 'function') {
        showNotification(this.t('micPermissionDenied'), 'error');
      }
      this.isPttRecording = false;
    }
  },

  // 2. Release: stop recording, convert and send
  async handlePttRelease(event) {
    // Prevent default event
    if (event && event.preventDefault && event.type !== 'touchend') {
       event.preventDefault();
    }

    if (!this.isPttRecording) return;
    this.isPttRecording = false;

    // ==========================================
    // Branch A: Web Speech API mode
    // ==========================================
    if (this.asrSettings.engine === 'webSpeech') {
      if (this.recognition) {
        // Use a one-time listener to send after recognition finishes
        const sendAfterRecognition = () => {
          // Remove listener to avoid duplicate callbacks
          this.recognition.removeEventListener('end', sendAfterRecognition);
          
          // Wait 100 ms for handleASRResult to update userInput
          setTimeout(() => {
            if (this.userInput && this.userInput.trim() !== '') {
              this.sendMessage(); // Trigger submission
            }
          }, 100);
        };

        // Bind one-time end listener
        this.recognition.addEventListener('end', sendAfterRecognition);
        
        this.recognition.stop(); // Stop recognition
        if (navigator.vibrate) navigator.vibrate(30);
      }
      return; 
    }

    // ==========================================
    // Branch B: other ASR modes
    // ==========================================
    if (!this.pttMediaRecorder) return;

    this.isProcessingPtt = true;

    // Stop recording
    if(this.pttMediaRecorder.state !== 'inactive') {
        this.pttMediaRecorder.stop();
    }
    
    // Turn off microphone recording indicator
    if (this.pttStream) {
      this.pttStream.getTracks().forEach(track => track.stop());
      this.pttStream = null;
    }
    
    if (navigator.vibrate) navigator.vibrate(30);

    // Wait for recording completion and merge audio
    await new Promise(resolve => {
      this.pttMediaRecorder.onstop = () => resolve();
    });

    // Process audio through processAndSendPttAudio
    await this.processAndSendPttAudio();
    
    this.isProcessingPtt = false;
    this.pttMediaRecorder = null;
  },

  // 3. Process audio
  async processAndSendPttAudio() {
    if (this.audioChunks.length === 0) return;

    try {
      // Merge recording chunks
      const mimeType = this.pttMediaRecorder ? this.pttMediaRecorder.mimeType : 'audio/webm';
      const rawBlob = new Blob(this.audioChunks, { type: mimeType });

      // Convert WebM/MP4 to 16 kHz WAV
      // This format is broadly supported by backend ASR
      const wavBlob = await this.convertBlobToWav(rawBlob, 16000);

      // Send
      await this.sendPttToBackend(wavBlob);

    } catch (error) {
      console.error("PTT Process Error:", error);
    }
  },

  // 4. Send to backend via existing WebSocket
  async sendPttToBackend(wavBlob) {
    // Ensure connection
    if (!this.asrWs || this.asrWs.readyState !== WebSocket.OPEN) {
      try {
        await this.initASRWebSocket();
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        showNotification("Could not connect to speech server", 'error');
        return;
      }
    }

    const reader = new FileReader();
    reader.readAsDataURL(wavBlob);
    reader.onloadend = () => {
      const base64data = reader.result.split(',')[1];
      const reqId = uuid.v4();

      // Send complete audio packet
      this.asrWs.send(JSON.stringify({
        type: 'audio_complete', 
        id: reqId,
        audio: base64data,
        format: 'wav',
        sample_rate: 16000
      }));
      
      // Mark that PTT result is pending
      this.waitingForPttResult = true;
    };
  },

  // 5. Audio format conversion helper
  async convertBlobToWav(blob, targetSampleRate = 16000) {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Offline resampling
    const offlineCtx = new OfflineAudioContext(1, audioBuffer.duration * targetSampleRate, targetSampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start();
    
    const renderedBuffer = await offlineCtx.startRendering();
    
    return this.bufferToWav(renderedBuffer);
  },

  // 6. Wrap buffer in WAV
  bufferToWav(abuffer) {
    const numOfChan = abuffer.numberOfChannels;
    const length = abuffer.length * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i, sample, offset = 0, pos = 0;

    // Write WAV header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit

    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    for (i = 0; i < abuffer.numberOfChannels; i++)
      channels.push(abuffer.getChannelData(i));

    while (pos < abuffer.length) {
      for (i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][pos]));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        view.setInt16(44 + offset, sample, true);
        offset += 2;
      }
      pos++;
    }

    function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { view.setUint32(pos, data, true); pos += 4; } // Advance position by four bytes

    return new Blob([buffer], { type: 'audio/wav' });
  },


    // WAV conversion
    async audioToWav(audioData) {
      try {
        // Audio parameters
        const sampleRate = 16000; // 16 kHz sample rate for speech recognition
        const numChannels = 1;    // Mono
        const bitsPerSample = 16; // 16-bit sample depth
        
        // Convert Float32Array to 16-bit PCM
        const int16Array = new Int16Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          // Convert floats in [-1,1] to integers in [-32768,32767]
          const sample = Math.max(-1, Math.min(1, audioData[i])); // Clamp range
          int16Array[i] = sample < 0 ? sample * 32768 : sample * 32767;
        }
        
        // Calculate file size
        const byteLength = int16Array.length * 2; // Two bytes per sample
        const buffer = new ArrayBuffer(44 + byteLength); // 44-byte WAV header plus audio
        const view = new DataView(buffer);
        
        // Write WAV file header
        const writeString = (offset, string) => {
          for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
          }
        };
        
        // RIFF chunk descriptor
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + byteLength, true); // File size minus eight
        writeString(8, 'WAVE');
        
        // fmt sub-chunk
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true); // fmt chunk size
        view.setUint16(20, 1, true);  // PCM audio format
        view.setUint16(22, numChannels, true); // Channel count
        view.setUint32(24, sampleRate, true);  // Sample rate
        view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true); // Byte rate
        view.setUint16(32, numChannels * bitsPerSample / 8, true); // Block alignment
        view.setUint16(34, bitsPerSample, true); // Bit depth
        
        // data sub-chunk
        writeString(36, 'data');
        view.setUint32(40, byteLength, true); // Data size
        
        // Write audio data
        const offset = 44;
        for (let i = 0; i < int16Array.length; i++) {
          view.setInt16(offset + i * 2, int16Array[i], true);
        }
        
        // Create Blob and return File
        const blob = new Blob([buffer], { type: 'audio/wav' });
        const file = new File([blob], 'audio.wav', { type: 'audio/wav' });
        
        return file;
        
      } catch (error) {
        console.error('Audio conversion error:', error);
        throw new Error('Failed to convert audio to WAV format');
      }
    },

    // Determine download source automatically
    async getAutoSource() {
      // Model downloads use Hugging Face by default.
      return 'huggingface';
    },

    async changeTTSstatus() {
      if (!this.ttsSettings.enabled) {
        this.TTSrunning = false;
      }
      if (this.ttsSettings.enabled === true && this.settings.enableOmniTTS === true) {
        this.settings.enableOmniTTS = false;
        showNotification(this.t('autoDisableOmniControlSettings'), 'warning');
      }else if (this.ttsSettings.enabled === true && this.ttsSettings.engine === 'moss'){
        if (!this.mossModelExists){
          showNotification(this.t('autoDownloadModel'), 'info');
          this.ttsSettings.enabled = false;
          let source = await this.getAutoSource();
          await this.mossDownload(source);
        }
      }
      await this.autoSaveSettings();
    },



/**
 * Streaming Markdown state-machine parser
 * Filter code blocks, inline code, tables and formulas; extract link text and defer incomplete syntax.
 * @param {Object} message Current message, holding temporary state
 * @param {string} deltaText Newly received streaming text
 * @param {boolean} isFinal Whether this is the final chunk
 * @returns {string} Filtered text ready for TTS
 */
processMarkdownStreamForTTS(message, deltaText, isFinal = false) {
    // Initialize per-message parser state to avoid conflicts between turns
    if (!message._ttsState) {
        message._ttsState = {
            inCodeBlock: false,
            inInlineCode: false,
            inTable: false,
            inMath: false,
            buffer: '' // Buffer incomplete syntax fragments
        };
    }

    const state = message._ttsState;
    let textToProcess = state.buffer + deltaText;
    let readableText = '';
    let i = 0;

    while (i < textToProcess.length) {
        // 1. Intercept fenced code blocks
        if (textToProcess.substring(i, i + 3) === '```') {
            state.inCodeBlock = !state.inCodeBlock;
            i += 3;
            continue;
        }
        if (state.inCodeBlock) {
            i++;
            continue;
        }

        // 2. Strip inline code delimiters but retain content
        if (textToProcess[i] === '`') {
            // Inline code text should still be read aloud
            i++;
            continue;
        }

        // 3. Intercept LaTeX math
        if (textToProcess.substring(i, i + 2) === '$$') {
            state.inMath = !state.inMath;
            i += 2;
            continue;
        }
        if (state.inMath) {
            i++;
            continue;
        }

        // 4. Intercept Markdown tables
        // Skip table rows starting with a pipe
        if ((i === 0 || textToProcess[i - 1] === '\n') && textToProcess[i] === '|') {
            state.inTable = true;
        }
        if (state.inTable) {
            if (textToProcess[i] === '\n') {
                state.inTable = false;
                readableText += ' '; // Use a space or line break as a natural speech pause
            }
            i++;
            continue;
        }

        // 5. Defer incomplete image and link syntax
        if (textToProcess[i] === '[' || (textToProcess[i] === '!' && textToProcess[i + 1] === '[')) {
            const remaining = textToProcess.slice(i);
            // Match complete Markdown links
            const match = remaining.match(/^(!?\[([^\]]*)\]\(([^)]*)\))/);
            if (match) {
                const completeMatch = match[1];
                const linkText = match[2];
                if (!completeMatch.startsWith('!')) {
                    // Extract link display text; omit image alt text
                    readableText += linkText;
                }
                i += completeMatch.length;
                continue;
            } else {
                // If a link or image starts but its closing parenthesis has not arrived,
                // defer processing until the next increment if the stream is ongoing.
                if (!isFinal) {
                    break;
                }
            }
        }

        // 6. Extract ordinary characters
        readableText += textToProcess[i];
        i++;
    }

    // Retain unprocessed text in buffer
    state.buffer = textToProcess.slice(i);
    return readableText;
},

/**
     * Split buffer by separators and voice tags; support multilingual voice names and incomplete fragments.
     * @returns {
     *   chunks: string[]        // Clean plain-text chunks
     *   chunks_voice: string[]  // Voice keys corresponding to chunks
     *   remaining: string       // Unfinished text
     *   remaining_voice: string // Voice key for remaining text
     * }
     */
    splitTTSBuffer(buffer) {
        // ============================================================
        // Remove Markdown images before other processing
        // Use a pattern matching all characters, including newlines, to remove complete images
        // This removes alt text inside or outside silence tags
        // ============================================================
        buffer = buffer.replace(/!\[[\s\S]*?\]\([\s\S]*?\)/g, '');

        // 1. Initialize voice stack and allowed voices
        if (!this.voiceStack) this.voiceStack = ['default'];
        const voiceKeys = ['default', 'silence', ...Object.keys(this.ttsSettings.newtts || {})].filter(Boolean);

        // ============================================================
        // Fallback noise suppression
        // ============================================================
        
        // A. Detect bare URLs and wrap them in silence tags
        buffer = buffer.replace(/(<silence>[\s\S]*?<\/silence>)|(https?:\/\/[^\s]+?(?=[,.:;!?。，：；？！]*?(?:\s|$)))/gi, (match, silence, url) => {
            if (silence) return silence; 
            return `<silence>${url}</silence>`;
        });

        // 2. Clean regular hyperlinks after image filtering; supports multiline links
        buffer = buffer
            .replace(/#{1,6}\s/gm, '')
            .replace(/[*~`]+/g, '')
            .replace(/^\s*[-*]\s/gm, '')
            .replace(/[\u{2600}-\u{27BF}\u{2700}-\u{27BF}\u{1F300}-\u{1F9FF}]/gu, '')
            .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
            .replace(/\[([\s\S]*?)\]\([\s\S]*?\)/g, '$1'); // Extract link display text only

        if (!buffer) {
            return {
                chunks: [],
                chunks_voice: [],
                remaining: '',
                remaining_voice: this.voiceStack[this.voiceStack.length - 1]
            };
        }

        // 2. Construct regex
        const separators = (this.ttsSettings.separators || [])
            .map(s => s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r'));

        const openTagRe = new RegExp(`<(${voiceKeys.join('|')})>`, 'gi');
        
        // Match multilingual closing tags instead of ASCII-only names
        // This allows non-English voice tags to pop correctly and prevents voice-stack imbalance
        const closeTagRe = /<\/[a-zA-Z0-9_\u4e00-\u9fa5]+>/gi; 
        
        const sepRe = separators.length
            ? new RegExp(separators.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g')
            : /$^/;

        // 3. Scan and sort tokens
        const tokens = [];
        let m;
        openTagRe.lastIndex = 0;
        while ((m = openTagRe.exec(buffer)) !== null) tokens.push({ type: 'open', value: m[1], index: m.index, raw: m[0] });

        closeTagRe.lastIndex = 0;
        while ((m = closeTagRe.exec(buffer)) !== null) tokens.push({ type: 'close', value: m[0], index: m.index, raw: m[0] });

        sepRe.lastIndex = 0;
        while ((m = sepRe.exec(buffer)) !== null) tokens.push({ type: 'sep', value: m[0], index: m.index, raw: m[0] });

        tokens.sort((a, b) => a.index - b.index);

        // 4. Process tokens
        const chunks = [];
        const chunks_voice = [];
        let segmentStart = 0;

        const emitText = (endIdx) => {
            const text = buffer.slice(segmentStart, endIdx);
            const cleaned = text.replace(/\s+/g, ' ').trim();
            if (cleaned && !/^[\s\p{P}]*$/u.test(cleaned)) {
                chunks.push(cleaned);
                chunks_voice.push(this.voiceStack[this.voiceStack.length - 1]);
            }
        };

        for (const tok of tokens) {
            switch (tok.type) {
                case 'open':
                    emitText(tok.index);
                    this.voiceStack.push(tok.value); // Push new voice
                    segmentStart = tok.index + tok.raw.length;
                    break;
                case 'close':
                    emitText(tok.index);
                    if (this.voiceStack.length > 1) {
                        this.voiceStack.pop(); // Pop current voice and restore previous voice
                    }
                    segmentStart = tok.index + tok.raw.length;
                    break;
                case 'sep':
                    emitText(tok.index);
                    segmentStart = tok.index + tok.raw.length;
                    break;
            }
        }

        // 5. Remaining text
        const remaining = buffer.slice(segmentStart);
        const remaining_voice = this.voiceStack[this.voiceStack.length - 1];

        return { chunks, chunks_voice, remaining, remaining_voice };
    },

    // TTS processing with streamed responses
    // Notify at TTS startup
    async startTTSProcess(message) {
      if (!this.ttsSettings.enabled || message.audioAborted) return;
      message._ttsRunning = true;
      this.TTSrunning = true;
      this.cur_audioDatas = [];
      
      // Use supplied message
      const lastMessage = message; 

      this.sendTTSStatusToVRM('ttsStarted', {
        totalChunks: lastMessage.ttsChunks.length
      });
      
      lastMessage.audioChunks = lastMessage.audioChunks || [];
      lastMessage.ttsQueue = lastMessage.ttsQueue || new Set();
      
      let max_concurrency = 1;
      let nextIndex = 0;
      while (message._ttsRunning && !message.audioAborted) {
        if (nextIndex == 0){
          let remainingText = lastMessage.ttsChunks?.[0] || '';
          let newttsList = [];
          if (remainingText && this.ttsSettings.newtts){
            for (const key in this.ttsSettings.newtts) {
              if (this.ttsSettings.newtts[key].enabled) {
                newttsList.push(key);
              }
            }
          }
          
          if (remainingText && this.ttsSettings.bufferWordList.length > 0  && newttsList == []){
            for (const exp of this.expressionMap) {
              const regex = new RegExp(exp, 'g');
              if (remainingText.includes(exp)) {
                remainingText = remainingText.replace(regex, '').trim(); 
              }
            }
            remainingText = remainingText.replace(/<[^>]+>/g, '');
            const hasChinese = /[\u4e00-\u9fa5]/.test(remainingText);

            if ((hasChinese && remainingText?.length > 5) || 
                (!hasChinese && remainingText?.length > 10)) {
                if (this.ttsSettings.bufferWordList.length > 0) {
                    const bufferWord = this.ttsSettings.bufferWordList[
                        Math.floor(Math.random() * this.ttsSettings.bufferWordList.length)
                    ];
                    lastMessage.ttsChunks.unshift(bufferWord);
                }
            }
          }
        }

        max_concurrency = this.ttsSettings.maxConcurrency || 1; 
        while (lastMessage.ttsQueue.size < max_concurrency && 
              nextIndex < lastMessage.ttsChunks.length) {
          if (!message._ttsRunning || message.audioAborted) break;
          const index = nextIndex++;
          lastMessage.ttsQueue.add(index);
          
          this.processTTSChunk(lastMessage, index).finally(() => {
            lastMessage.ttsQueue.delete(index);
          });
          if (index == 0){
            this.stopTimer();
            console.log(`TTS chunk 0 start in ${this.elapsedTime}ms`);
            await new Promise(resolve => setTimeout(resolve, 800));
          }
        }
        
        if (lastMessage.generationFinished && 
            nextIndex >= lastMessage.ttsChunks.length && 
            lastMessage.ttsQueue.size === 0) {
            break; // All text submitted and audio requests finished; exit TTS processing
        }

        await new Promise(resolve => setTimeout(resolve, 10));
      }
      message._ttsRunning = false;
      // this.messages[this.messages.length - 1].currentChunk = 0;
      console.log('TTS queue processing completed');
    },
    startTimer() {
      this.startTime = Date.now();
    },
    stopTimer() {
      this.elapsedTime = Date.now() - this.startTime;
    },
    async processTTSChunk(message, index) {
        if (message.audioAborted) return;
        let voice = message.chunks_voice[index];
        const chunk = message.ttsChunks[index];
        
        // Parse marker
        const isVrmSilent = voice.startsWith('danmaku_vrm_silent:');
        if (isVrmSilent) {
            voice = voice.replace('danmaku_vrm_silent:', ''); // Restore actual voice ID
        }

        let chunk_text = chunk;
        let chunk_expressions = [];

        if (chunk.indexOf('<') !== -1) {
            const tagReg = /<[^>]+>/g;
            chunk_expressions = (chunk.match(tagReg) || []).map(t => t.slice(1, -1));
            chunk_text = chunk.replace(tagReg, '').trim();
        }

        const offset = message.chunks_voice.filter(v => v.startsWith('danmaku_vrm_silent:')).length;
        const vrmIndex = index - offset; // Compute virtual index for VRM

        const markChunkAsPlayablePlaceholder = (metadata = {}) => {
            message.audioChunks[index] = {
                url: null,
                expressions: chunk_expressions,
                text: chunk_text,
                index,
                ...metadata
            };
        };

        if (!chunk_text) {
            // Tags such as <user=... love=...> may become an empty TTS chunk
            // after expression/status metadata is stripped. Do not POST empty
            // text to /tts; enqueue a silent placeholder so playback can advance.
            if (chunk_expressions.length > 0 && this.ttsWebSocket && (this.vrmOnline || this.vtsOnline)) {
                const cmd = JSON.stringify({
                    type: 'startSpeaking',
                    data: { chunkIndex: index, text: '', voice: 'silence', expressions: chunk_expressions }
                });
                this.ttsWebSocket.send(cmd);
            }
            markChunkAsPlayablePlaceholder({ _silent: true });
            this.checkAudioPlayback();
            return;
        }

        try {
            if (voice === 'silence') {
                // Send silent blocks as text commands
                const cmd = JSON.stringify({
                    type: 'startSpeaking',
                    data: { chunkIndex: index, text: chunk_text, voice: 'silence', expressions: chunk_expressions }
                });
                if (this.ttsWebSocket && (this.vrmOnline || this.vtsOnline)) this.ttsWebSocket.send(cmd);
                message.audioChunks[index] = { url: null, expressions: chunk_expressions, text: chunk_text, index };
                this.checkAudioPlayback();
            } else {
                const response = await fetch(`/tts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ttsSettings: this.ttsSettings, text: chunk_text, index, voice })
                });

                if (response.ok) {
                    await this._streamTTSResponse(response, message, index, chunk_expressions, chunk_text, vrmIndex, isVrmSilent);
                    this.checkAudioPlayback();
                } else {
                    console.warn(`TTS chunk ${index} returned ${response.status}, skipping`);
                    message.audioChunks[index] = {
                        url: null,
                        expressions: chunk_expressions,
                        text: chunk_text,
                        index,
                        _failed: true
                    };
                    this.checkAudioPlayback();
                }
            }
        } catch (error) {
            console.error(`TTS Chunk ${index} error:`, error);
            message.audioChunks[index] = {
                url: null,
                expressions: chunk_expressions,
                text: chunk_text,
                index,
                _failed: true
            };
            this.checkAudioPlayback();
        }
    },

    async _streamTTSResponse(response, message, index, chunk_expressions, chunk_text, vrmIndex, isVrmSilent) {
        const mimeType = response.headers.get('content-type') || 'audio/mpeg';

        if (typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported(mimeType)) {
            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audioBuffer = await audioBlob.arrayBuffer();
            message.audioChunks[index] = { url: audioUrl, buffer: audioBuffer, mimeType, expressions: chunk_expressions, text: chunk_text, index };
            return { url: audioUrl, buffer: audioBuffer, mimeType };
        }

        const ms = new MediaSource();
        const audioUrl = URL.createObjectURL(ms);
        const allChunks = [];
        const pendingChunks = [];
        let sourceBuffer = null;
        let streamDone = false;

        const flushQueue = () => {
            if (!sourceBuffer || sourceBuffer.updating) return;
            if (pendingChunks.length > 0) {
                try { 
                    // Append one audio chunk at a time; updateend triggers the next append
                    sourceBuffer.appendBuffer(pendingChunks.shift()); 
                } catch (e) { 
                    console.error('appendBuffer failed:', e); 
                }
            } else if (streamDone) {
                try { ms.endOfStream(); } catch (e) {}
            }
        };

        const reader = response.body.getReader();
        const ctx = this;

        // Create playback Audio element, triggering MediaSource sourceopen
        const audio = new Audio(audioUrl);
        audio.preload = 'auto';
        const audioReady = new Promise((resolve) => {
            const onReady = () => {
                try {
                    sourceBuffer = ms.addSourceBuffer(mimeType);
                    sourceBuffer.addEventListener('updateend', flushQueue);
                    resolve();
                } catch (e) {
                    sourceBuffer = null;
                    resolve();
                }
            };
            if (ms.readyState === 'open') { onReady(); }
            else { ms.addEventListener('sourceopen', onReady, { once: true }); }
        });

        // Wait for SourceBuffer
        try {
            await Promise.race([
                audioReady,
                new Promise((_, reject) => setTimeout(() => reject(new Error('sb_timeout')), 30000))
            ]);
        } catch (e) {
            console.warn('MediaSource setup failed, falling back to blob:', e);
            try { await reader.cancel(); } catch (e2) {}
            const audioBlob = await response.blob();
            const audioUrl2 = URL.createObjectURL(audioBlob);
            const audioBuffer = await audioBlob.arrayBuffer();
            message.audioChunks[index] = { url: audioUrl2, buffer: audioBuffer, mimeType, expressions: chunk_expressions, text: chunk_text, index };
            return { url: audioUrl2, buffer: audioBuffer, mimeType };
        }

        // Read and append the first audio chunk before play()
        try {
            const first = await Promise.race([
                reader.read(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('read_timeout')), 8000))
            ]);
            if (first && !first.done && first.value && first.value.length > 0) {
                allChunks.push(first.value);
                if (sourceBuffer && !sourceBuffer.updating) {
                    sourceBuffer.appendBuffer(first.value);
                    await new Promise((resolve) => {
                        sourceBuffer.addEventListener('updateend', () => resolve(), { once: true });
                        setTimeout(() => resolve(), 30000);
                    });
                }
            }
        } catch (e) {
            console.warn('First chunk read failed:', e);
        }

        // Store entry including the pre-created Audio element
        message.audioChunks[index] = {
            url: audioUrl,
            buffer: null,
            mimeType,
            expressions: chunk_expressions,
            text: chunk_text,
            index,
            _streaming: true,
            _audio: audio
        };

        // Read remaining data in background
        (async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) { 
                        streamDone = true; 
                        flushQueue(); 
                        break; 
                    }
                    allChunks.push(value);
                    pendingChunks.push(value);
                    flushQueue();
                }
                // Wait for the decoder to consume queued audio
                while (sourceBuffer && (sourceBuffer.updating || pendingChunks.length > 0)) {
                    await new Promise(r => setTimeout(r, 50));
                }
            } catch (e) {
                console.error("Stream reader error:", e);
            }

            const totalLength = allChunks.reduce((sum, c) => sum + c.length, 0);
            const completeBuffer = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of allChunks) {
                completeBuffer.set(chunk, offset);
                offset += chunk.length;
            }

            const audioChunk = message.audioChunks[index];
            if (audioChunk) {
                audioChunk.buffer = completeBuffer.buffer;
                audioChunk._streaming = false;
                if (!isVrmSilent && vrmIndex >= 0 && (ctx.vrmOnline || ctx.vtsOnline) && ctx.ttsWebSocket) {
                    ctx.sendBinaryToVRM({
                        type: 'audio_chunk',
                        chunkIndex: vrmIndex,
                        text: chunk_text,
                        expressions: chunk_expressions,
                        mimeType
                    }, completeBuffer.buffer);
                }
            }
        })();

        return { url: audioUrl, buffer: null, mimeType, _streaming: true };
    },

    // Audio playback process
    async startAudioPlayProcess(message, resolve) {
      if (!this.ttsSettings.enabled) {
          if(resolve) resolve();
          return;
      }
      
      const lastMessage = message;
      lastMessage.currentChunk = lastMessage.currentChunk || 0;
      lastMessage.isPlaying = false;
      lastMessage.audioAborted = false; // Reset interruption marker when starting a new queue
      
      this.audioPlayQueue = [];
      console.log('Audio playback monitor started for:', message.agentName);
      
      // Start recursive check
      this.checkAudioPlayback(message, resolve);
    },

    async checkAudioPlayback(message, resolve) {
       // Stop recursion if playback was interrupted
        if (!message || message.audioAborted) { 
            if (message) message.isPlaying = false;
            if (resolve) resolve(); 
            return; 
        }
        
        const lastMessage = message;

        if (lastMessage.isPlaying) {
            setTimeout(() => this.checkAudioPlayback(message, resolve), 50);
            return;
        }

        const currentIndex = lastMessage.currentChunk;
        const audioChunk = lastMessage.audioChunks[currentIndex];
        
        // Wait while this chunk is being synthesized
        if (!audioChunk) {
            // If all available chunks have played
            const allLocalChunksPlayed = currentIndex >= (lastMessage.ttsChunks?.length || 0);
            
            if (allLocalChunksPlayed) {
                // Determine whether the playing message is the newest conversation message
                const isLatestMessage = this.messages.length > 0 && 
                                      this.messages[this.messages.length - 1] === lastMessage;

                if (lastMessage.generationFinished) {
                    console.log("Playback complete");
                    // Only the newest message can clear the global TTS flag
                    if (isLatestMessage) {
                        this.TTSrunning = false; 
                    }
                    lastMessage._ttsRunning = false;
                    // Reset progress to the first chunk after playback
                    lastMessage.currentChunk = 0;
                    try { fetch('/api/overlay/danmaku/clear', { method: 'POST' }).catch(()=>{}); } catch(e){}
                    if (resolve) resolve();
                    return;
                } else {
                    if (!this.isSending) { 
                        console.warn("Generation stopped without completion marker; releasing lock");
                        lastMessage.generationFinished = true; 
                        
                        // Apply the same guard
                        if (isLatestMessage) {
                            this.TTSrunning = false; 
                        }
                        lastMessage._ttsRunning = false;
                        lastMessage.currentChunk = 0;
                        try { fetch('/api/overlay/danmaku/clear', { method: 'POST' }).catch(()=>{}); } catch(e){}
                        if (resolve) resolve();
                        return;
                    }
                    setTimeout(() => this.checkAudioPlayback(message, resolve), 50);
                    return;
                }
            }
            setTimeout(() => this.checkAudioPlayback(message, resolve), 50);
            return;
        }

        const rawVoice = lastMessage.chunks_voice[currentIndex] || '';
        const isVrmSilent = rawVoice.startsWith('danmaku_vrm_silent:');
        const actualVoice = isVrmSilent ? rawVoice.replace('danmaku_vrm_silent:', '') : rawVoice;

        // Skip failed synthesis placeholders to avoid stalling the queue
        if (audioChunk && audioChunk._failed) {
            console.warn(`Skipping failed TTS chunk ${currentIndex}`);
            lastMessage.currentChunk++;
            setTimeout(() => this.checkAudioPlayback(message, resolve), 0);
            return;
        }

        // Silent/metadata-only chunks intentionally have no audio URL. They still
        // occupy a queue slot so later chunks keep their original indices.
        if (audioChunk && !audioChunk.url) {
            lastMessage.currentChunk++;
            setTimeout(() => this.checkAudioPlayback(message, resolve), 0);
            return;
        }

        
        // Compute offset
        const offset = lastMessage.chunks_voice.filter(v => v.startsWith('danmaku_vrm_silent:')).length;
        const vrmIndex = currentIndex - offset;

        if (!lastMessage.isPlaying) {
            lastMessage.isPlaying = true;
            if (currentIndex == 0){
              this.stopTimer();
              lastMessage.first_sentence_latency = this.elapsedTime;
            }

            try {

                if (!audioChunk.buffer && audioChunk.url && !audioChunk._streaming) {
                    try {
                        const res = await fetch(audioChunk.url);
                        audioChunk.buffer = await res.arrayBuffer();
                        if (!audioChunk.mimeType) {
                            audioChunk.mimeType = res.headers.get('content-type') || 'audio/wav';
                        }
                    } catch (err) {
                        console.warn("Failed to fetch buffer for history audio", err);
                    }
                }

                // Send binary audio at this point only for non-livestream blocks while VRM is online
                if (!isVrmSilent && vrmIndex >= 0 && (this.vrmOnline || this.vtsOnline) && audioChunk.buffer) {
                    const metadata = {
                        type: 'audio_chunk',
                        chunkIndex: vrmIndex,
                        text: audioChunk.text,
                        expressions: audioChunk.expressions,
                        mimeType: audioChunk.mimeType
                    };

                    console.log(`Sending audio chunk ${currentIndex} to VRM with metadata:`, metadata);
                    // VRM starts playback immediately in sync with muted browser playback
                    this.sendBinaryToVRM(metadata, audioChunk.buffer);
                }

                lastMessage._currentAudio = audioChunk._audio || new Audio(audioChunk.url);
                
                if (isVrmSilent) {
                    lastMessage._currentAudio.volume = 1.0; // Livestream audio plays in the browser
                    console.log("Playing livestream message:", audioChunk.text);
                } else {
                    lastMessage._currentAudio.volume = this.vrmOnline ? 0.0000001 : 1.0; // AI audio plays through VRM when available
                }
                
                // Notify VRM to update UI and expressions
                if (!isVrmSilent && vrmIndex >= 0) {
                    this.sendTTSStatusToVRM('startSpeaking', {
                        chunkIndex: vrmIndex,
                        totalChunks: lastMessage.ttsChunks.length - offset,
                        text: audioChunk.text,
                        expressions: audioChunk.expressions,
                        voice: actualVoice
                    });
                }
                
                // Wait for current audio to finish
                await new Promise((r) => {
                    lastMessage._currentAudio.onended = r;
                    lastMessage._currentAudio.onerror = r; 
                    lastMessage._currentAudio.play().catch(e => {
                        console.error("Playback failed", e);
                        r(); 
                    });
                    setTimeout(r, 20000); 
                });
                
            } catch (error) {
                console.error(`Playback error: ${error}`);
            } finally {
                lastMessage.isPlaying = false;
                
                // Check for interruption or track changes after audio ends
                if (lastMessage.audioAborted) {
                    if (resolve) resolve();
                    return; // Stop this message's queue without scheduling another timeout
                }
                
                lastMessage.currentChunk++;
                // Start the next chunk only after onended
                setTimeout(() => this.checkAudioPlayback(message, resolve), 0);
            }
        }
    },
    // Polling function
    pollVRMStatus() {
      this.vrmPollTimer = setInterval(async () => {
        try {
          const r = await fetch('/tts/status').then(r => r.json())
          this.vrmOnline = r.vrm_connections > 0;
          this.vtsOnline = r.vts_active; // Read VTS active state
        } catch (e) {
          this.vrmOnline = false;
          this.vtsOnline = false;
        }
      }, 3000)
    },
    // Stop audio playback when generation stops
    stopAudioPlayback() {
      // Optional current-audio cleanup
      const lastMessage = this.messages[this.messages.length - 1];
      if (lastMessage) {
        lastMessage.isPlaying = false;
      }
    },
    toggleTTS(message) {
      if (message.isPlaying) {
        // Stop if currently playing
        message.isPlaying = false;
        this.stopAllAudioPlayback();
        this.sendTTSStatusToVRM('stopSpeaking', {});
      } else {
        // If not playing
        this.stopAllAudioPlayback();
        
        if (message.isOmni) {
          // --- Omni handling ---
          if ((message.omniCurrentTime || 0) >= (message.omniDuration || 0) - 0.1) {
            message.omniCurrentTime = 0; 
          }
          message.isPlaying = true;
          this.playOmniFromTime(message, message.omniCurrentTime);
        } else {
          // --- Ordinary TTS: reuse streaming playback ---
          message.isPlaying = false; 
          message.audioAborted = false; // Reset interruption marker on manual resume
          
          // Retain this line to restart playback from the beginning
          message.currentChunk = 0;  
          
          message.generationFinished = true; 
          this.checkAudioPlayback(message);
        }
      }
    },
    // Seek progress bar
    seekOmniTTS(message, time) {
      this.stopAllAudioPlayback();
      message.omniCurrentTime = time;
      if (message.isPlaying || true) { // Usually start playback after seeking
        message.isPlaying = true;
        this.playOmniFromTime(message, time);
      }
    },

    // Core replay logic
    async playOmniFromTime(message, startTime = 0) {
      if (!message.omniAudioChunks || message.omniAudioChunks.length === 0) return;
      
      if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
      
      // Set scheduling origin to current time for each new playback
      this.audioStartTime = this.audioCtx.currentTime;

      let accumulated = 0;
      for (const b64 of message.omniAudioChunks) {
        // Stop scheduling if user pauses
        if (!message.isPlaying) break;

        const chunkDuration = (atob(b64).length / 2) / 24000;
        
        // Play only chunks after startTime
        if (accumulated + chunkDuration > startTime) {
          this.playPCMChunk(b64, message.pure_content, message);
        }
        accumulated += chunkDuration;
      }
    },

    // Stop all current audio playback
    stopAllAudioPlayback() {
      // Release the livestream queue lock on every call, as in sendMessage
      this.TTSrunning = false;
      // Mark all messages to stop their playback loops
      this.messages.forEach(message => {
        message.audioAborted = true; 
        message.isPlaying = false;
        // Fade out and stop each message's audio
        if (message._currentAudio && typeof message._currentAudio.pause === 'function' && !message._currentAudio.paused) {
          const audio = message._currentAudio;
          const fadeSteps = 5;
          const fadeInterval = 30;
          let step = 0;
          const origVolume = audio.volume;
          const fadeOut = setInterval(() => {
            step++;
            audio.volume = Math.max(0, origVolume * (1 - step / fadeSteps));
            if (step >= fadeSteps) {
              clearInterval(fadeOut);
              audio.pause();
              audio.volume = origVolume;
              if (typeof audio.onended === 'function') {
                audio.onended(); 
              }
            }
          }, fadeInterval);
        }
        message._currentAudio = null;
      });

      // 2. Stop read-aloud audio
      if (this.currentReadAudio) {
        this.currentReadAudio.pause();
        if (typeof this.currentReadAudio.onended === 'function') {
          this.currentReadAudio.onended();
        }
        this.currentReadAudio = null;
      }
      
      // 3. Stop all Web Audio Omni nodes
      if (this.activeSources && this.activeSources.length > 0) {
        this.activeSources.forEach(src => {
          src.isForceStopped = true; 
          try {
            src.stop(); // Stop playback immediately
          } catch (e) {}
        });
        this.activeSources = [];
      }
      
      this.isOmniPlaying = false; 
      this.audioStartTime = 0; 

      // 6. Send stop signal to VRM
      this.sendTTSStatusToVRM('stopSpeaking', {});
    },

    async playAudioChunk(message) {
      if (!this.ttsSettings.enabled){
        message.isPlaying = false; // Stop if no audio chunks
        message.currentChunk = 0; // Reset index
        return;
      }

      // Initialize cur_audioDatas if missing
      if (!this.cur_audioDatas) {
        this.cur_audioDatas = {};
      }

      // Use message ID as unique key
      const base64Key = `msg_${message.id}_chunk_${message.currentChunk}`;

      const audioChunk = message.audioChunks[message.currentChunk];
      if (audioChunk) {
        // Check for playable audio URL
        if (!audioChunk.url) {
          console.log(`Audio chunk ${message.currentChunk} has no URL, skipping`);
          message.currentChunk++;
          this.playAudioChunk(message);
          return;
        }

        const audio = new Audio(audioChunk.url);
        message._currentAudio = audio;

        // Mute browser audio when VRM is online; otherwise play normally
        audio.volume = this.vrmOnline ? 0.0000001 : 1;

        // Generate Base64 from blob URL if absent
        if (!this.cur_audioDatas[base64Key] && audioChunk.url) {
          try {
            const response = await fetch(audioChunk.url);
            const blob = await response.blob();
            const base64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result.split(',')[1]);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            this.cur_audioDatas[base64Key] = `data:${blob.type};base64,${base64}`;
            console.log(`Generated base64 for ${base64Key}, length: ${this.cur_audioDatas[base64Key].length}`);
          } catch (error) {
            console.warn(`Failed to generate base64 for ${base64Key}:`, error);
            this.cur_audioDatas[base64Key] = '';
          }
        }

        // Send startSpeaking to VRM for each chunk
        // Require Base64 before sending startSpeaking
        const audioDataUrl = this.cur_audioDatas[base64Key];
        if (audioDataUrl && audioDataUrl.length > 0) {
          console.log(`Sending startSpeaking with base64 data for ${base64Key}`);
          this.sendTTSStatusToVRM('startSpeaking', {
            audioDataUrl: audioDataUrl,
            chunkIndex: message.currentChunk,
            totalChunks: message.audioChunks.length,
            text: audioChunk.text || '',
            expressions: audioChunk.expressions || [],
            voice: message.chunks_voice ? message.chunks_voice[message.currentChunk] || 'default' : 'default',
          });
        } else {
          console.warn(`No base64 data available for ${base64Key}, skipping startSpeaking`);
        }

        try {
          await audio.play();
          audio.onended = () => {
            // Send chunkEnded to VRM
            this.sendTTSStatusToVRM('chunkEnded', {
              chunkIndex: message.currentChunk
            });

            message.currentChunk++; // Advance index after playback
            this.playAudioChunk(message); // Recursively play next chunk
          };
          audio.onerror = (error) => {
            console.error(`Error playing audio chunk ${message.currentChunk}:`, error);
            message.isPlaying = false; // Stop playback on error
          };
        } catch (error) {
          console.error(`Error playing audio chunk ${message.currentChunk}:`, error);
          message.currentChunk++; // Advance index after playback
          this.playAudioChunk(message); // Recursively play next chunk
        }
      } else {
        message.isPlaying = false; // Stop if no audio chunks
        message.currentChunk = 0; // Reset index
        // Notify VRM that all chunks have played
        this.sendTTSStatusToVRM('allChunksCompleted', {});
      }
    },
    backwardTTS(message) {
      if (message.currentChunk > 0) {
        message.currentChunk--; // Decrement current index
      }
    },

    forwardTTS(message) {
      if (message.currentChunk < message.audioChunks.length - 1) {
        message.currentChunk++; // Increment current index
      }
    },

    updateLanguages() {
      // Update language in ttsSettings
      this.ttsSettings.edgettsLanguage = this.edgettsLanguage;
      
      // Update gender and voice
      this.updateGenders(); 
      this.autoSaveSettings();
    },
    // Update gender and voice when language changes
    updateGenders() {
      // Update gender in ttsSettings
      this.ttsSettings.edgettsGender = this.edgettsGender;
      // Select first voice
      this.ttsSettings.edgettsVoice = this.filteredVoices[0].name;

      // Update voice
      this.updateVoices();
      this.autoSaveSettings();
    },


    // Update voice when gender changes
    updateVoices() {
      this.autoSaveSettings();
    },

    updateNewLanguages() {
      // Update language in ttsSettings
      this.newTTSConfig.edgettsVoice = this.filteredNewVoices[0].name;
    },
    // Update gender and voice when language changes
    updateNewGenders() {
      // Update gender in ttsSettings
      this.newTTSConfig.edgettsVoice = this.filteredNewVoices[0].name;
    },
      // Browse reference audio
  browseGsvRefAudioFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = (event) => {
      const files = event.target.files;
      if (files.length > 0) {
        this.newGsvAudio.name = files[0].name;
        this.newGsvAudio.file = files[0]; // Store file object
      }
    };
    input.click();
  },
  
  // Handle reference audio drop
  handleGsvRefAudioDrop(event) {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      this.newGsvAudio.name = files[0].name;
      this.newGsvAudio.file = files[0]; // Store file object
    }
  },
  
  // Remove selected reference audio
  removeNewGsvAudio() {
    this.newGsvAudio.name = '';
    this.newGsvAudio.file = null;
  },
  
  // Cancel upload
  cancelGsvAudioUpload() {
    this.showGsvRefAudioPathDialog = false;
    this.newGsvAudio.name = '';
    this.newGsvAudio.text = '';
    this.newGsvAudio.file = null;
  },
  
  // Upload reference audio
  async uploadGsvAudio() {
    if (!this.newGsvAudio.file && !this.newGsvAudio.path) {
      showNotification('Select an audio file first', 'error');
      return;
    }
    if (!this.newGsvAudio.file) {
        // Add audio to options
        const newAudioOption = {
          path: this.newGsvAudio.path,
          name: this.newGsvAudio.name,
          text: this.newGsvAudio.text
        };
        
        this.ttsSettings.gsvAudioOptions.push(newAudioOption);
        
        // Close dialog and reset state
        this.cancelGsvAudioUpload();
        
        // Autosave settings
        await this.autoSaveSettings();
        
        showNotification('Reference audio uploaded');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', this.newGsvAudio.file);
    formData.append('prompt_text', this.newGsvAudio.text);
    
    try {
      const response = await fetch(`/upload_gsv_ref_audio`, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Add audio to options
        const newAudioOption = {
          path: result.file.unique_filename,
          name: result.file.name,
          text: this.newGsvAudio.text
        };
        
        this.ttsSettings.gsvAudioOptions.push(newAudioOption);
        
        // Close dialog and reset state
        this.cancelGsvAudioUpload();
        
        // Autosave settings
        await this.autoSaveSettings();
        
        showNotification('Reference audio uploaded');
      } else {
        showNotification(`Upload failed: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('Reference audio upload failed:', error);
      showNotification('Upload failed. Check the network connection.', 'error');
    }
  },
  
  // Handle reference audio path changes
  handleRefAudioPathChange(value, option) {
    // Update prompt text for selected reference audio
    const selectedAudio = this.ttsSettings.gsvAudioOptions.find(
      audio => audio.path === value
    );
    
    if (selectedAudio && selectedAudio.text) {
      if (option == 'role') {
        this.newTTSConfig.gsvPromptText = selectedAudio.text;
      }
      else if (option == 'model') {
        this.ttsSettings.gsvPromptText = selectedAudio.text;
      }
      
    }
    
    // Autosave settings
    this.autoSaveSettings();
  },


    // Delete audio option
  async deleteAudioOption(path) {
    try {
      // Find selected audio option
      const audioIndex = this.ttsSettings.gsvAudioOptions.findIndex(
        audio => audio.path === path
      );
      
      if (audioIndex === -1) return;
      if (this.ttsSettings.gsvAudioOptions[audioIndex].path == this.ttsSettings.gsvAudioOptions[audioIndex].name){
        // Remove path-based audio directly from options
        this.ttsSettings.gsvAudioOptions.splice(audioIndex, 1);
        showNotification('Audio deleted');
        return;
      }
      // Get filename for backend deletion
      const uniqueFilename = this.ttsSettings.gsvAudioOptions[audioIndex].path
        .split('/')
        .pop();
      
      // Call deletion API
      const response = await fetch(`/delete_audio/${uniqueFilename}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Remove option
        this.ttsSettings.gsvAudioOptions.splice(audioIndex, 1);
        
        // Reset selection if selected audio was deleted
        if (this.ttsSettings.gsvRefAudioPath === path) {
          this.ttsSettings.gsvRefAudioPath = '';
          this.ttsSettings.gsvPromptText = '';
        }
        
        // Autosave settings
        await this.autoSaveSettings();
        
        showNotification('Audio deleted');
      } else {
        showNotification(`Deletion failed: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('Audio deletion failed:', error);
      showNotification('Deletion failed. Try again later.', 'error');
    }
  },
    goToMainApp() {
    if (this.isElectron) {
      window.location.href = `${this.partyURL}/index.html`;
    } else {
      window.location.href = '/';
    }
  },
    async startVRM() {
    if (this.isElectron) {
      this.VRMConfig.name = 'default';
      await this.autoSaveSettings();
      // Electron environment
      try {
        this.isVRMStarting = true;
        const windowConfig = {
          width: this.VRMConfig.windowWidth,
          height: this.VRMConfig.windowHeight,
        };
        await window.electronAPI.startVRMWindow(windowConfig);
      } catch (error) {
        console.error('Startup failed:', error);
      } finally {
        this.isVRMStarting = false;
      }
    } else {
      // Browser environment
      window.open(`${this.partyURL}/vrm.html`, '_blank');
    }
  },
    async startNewVRM(name) {
    try {
      this.isVRMStarting = true;
      this.VRMConfig.name = name;
      this.VRMConfig.selectedNewModelId = this.VRMConfig.newVRM[name].selectedModelId;
      this.VRMConfig.selectedNewMotionIds = this.VRMConfig.newVRM[name].selectedMotionIds;
      await this.autoSaveSettings();
    if (this.isElectron) {
      // Electron environment
        const windowConfig = {
          width: this.VRMConfig.newVRM[name].windowWidth,
          height: this.VRMConfig.newVRM[name].windowHeight,
        };
        await window.electronAPI.startVRMWindow(windowConfig);
    } else {
      // Browser environment
      window.open(`${this.partyURL}/vrm.html`, '_blank');
    }      
  } catch (error) {
    console.error('Startup failed:', error);
  } finally {
    this.isVRMStarting = false;
  }
  },
  async startVRMweb() {
    if (this.isElectron) {
      window.electronAPI.openExternal(`${this.partyURL}/vrm.html`);
    }else {
      // Browser environment
      window.open(`${this.partyURL}/vrm.html`, '_blank');
    }
  },

  async stopVRM() {
    if (this.isElectron) {
      try {
        await window.electronAPI.stopVRMWindow();
      } catch (error) {
        console.error('Failed to close VRM:', error);
      }
    }
  },
    async checkServerPort() {
      try {
        // Option 1: use dedicated method
        const serverInfo = await window.electronAPI.getServerInfo()
        
        
        if (!serverInfo.isDefaultPort) {
          const message = "Default port " + serverInfo.defaultPort + " is occupied; switched to port " + serverInfo.port
          showNotification(message, 'warning')
        }
      } catch (error) {
        console.error('Failed to get server information:', error)
      }
    },
    // Initialize WebSocket
    initTTSWebSocket() {
      const http_protocol = window.location.protocol;
      const ws_protocol = http_protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${ws_protocol}//${window.location.host}/ws/tts`;
      this.ttsWebSocket = new WebSocket(wsUrl);
      
      this.ttsWebSocket.onopen = () => {
        console.log('TTS WebSocket connected');
        this.wsConnected = true;
      };
      
      // Listen for backend JSON feedback
      this.ttsWebSocket.onmessage = async (event) => {
        try {
          // Handle text messages as JSON
          if (typeof event.data === 'string') {
            const msg = JSON.parse(event.data);
            
            // Match VTS status feedback
            if (msg.type === 'vts_connection_status') {
              this.isVTSStarting = false; // Stop loading when feedback arrives
              
              if (msg.data.success) {
                // Connection succeeded
                this.VTSConfig.enabled = true;
                showNotification(msg.data.message || 'VTube Studio connected', 'success', 'VTS');
              } else {
                // Connection failed; restore toggle
                this.VTSConfig.enabled = false;
                // Show error and guide user to enable VTS
                showNotification(
                  msg.data.message || 'Ensure API access is enabled in VTube Studio',
                  'error', 
                  'VTS connection failed'
                );
              }
              this.autoSaveSettings(); // Save local settings
            }
          } 
          // Handle binary audio by forwarding or playback
          else if (event.data instanceof Blob) {
            // Retain existing VRM playback handling
            // this.handleAudioBlob(event.data); 
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };
      
      this.ttsWebSocket.onclose = () => {
        console.log('TTS WebSocket disconnected');
        this.wsConnected = false;
        this.isVTSStarting = false; // Stop loading on disconnect
        
        // Reconnect automatically
        setTimeout(() => {
          if (!this.wsConnected) {
            this.initTTSWebSocket();
          }
        }, 3000);
      };
      
      this.ttsWebSocket.onerror = (error) => {
        console.error('TTS WebSocket error:', error);
        this.isVTSStarting = false;
      };
    },
    
    // Send TTS status to VRM
    async sendTTSStatusToVRM(type, data) {
      if (this.ttsWebSocket && this.wsConnected) {
        this.ttsWebSocket.send(JSON.stringify({
          type,
          data,
          timestamp: Date.now()
        }));
      }
    },
  // Browse VRM model files
  browseVrmModelFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vrm';
    input.onchange = (event) => {
      const files = event.target.files;
      if (files.length > 0) {
        const file = files[0];
        // Check extension
        if (!file.name.toLowerCase().endsWith('.vrm')) {
          showNotification('Only .vrm files are supported', 'error');
          return;
        }
        this.newVrmModel.name = file.name;
        this.newVrmModel.file = file;
        // Set display name without extension
        this.newVrmModel.displayName = file.name.replace(/\.vrm$/i, '');
      }
    };
    input.click();
  },
  
  // Handle VRM model drop
  handleVrmModelDrop(event) {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      // Check extension
      if (!file.name.toLowerCase().endsWith('.vrm')) {
        showNotification('Only .vrm files are supported', 'error');
        return;
      }
      this.newVrmModel.name = file.name;
      this.newVrmModel.file = file;
      // Set display name without extension
      this.newVrmModel.displayName = file.name.replace(/\.vrm$/i, '');
    }
  },
  
  // Remove selected VRM model
  removeNewVrmModel() {
    this.newVrmModel.name = '';
    this.newVrmModel.displayName = '';
    this.newVrmModel.file = null;
  },
  
  // Cancel upload
  cancelVrmModelUpload() {
    this.showVrmModelDialog = false;
    this.newVrmModel.name = '';
    this.newVrmModel.displayName = '';
    this.newVrmModel.file = null;
  },
  
  
  // Handle model selection changes
  handleModelChange(value) {
    // Autosave settings
    this.autoSaveSettings();
  },

  // Check whether current engine uses Goal mode
  isGoalModeActive() {
    const engine = this.CLISettings.engine;
    if (engine === 'local') {
      return this.localEnvSettings.permissionMode === 'goal';
    } else if (engine === 'ds') {
      return this.dsSettings.permissionMode === 'goal';
    } else if (engine === 'wsl') {
      return this.wslSettings.permissionMode === 'goal';
    } else {
      return this.acpSettings.permissionMode === 'goal';
    }
  },
  
 
    // Load default model list
  async loadDefaultModels() {
    try {
      const response = await fetch(`/get_default_vrm_models`);
      const result = await response.json();
      
      if (result.success) {
        this.VRMConfig.defaultModels = result.models;
        console.log(this.VRMConfig.defaultModels);
        // Select the first default model if none selected
        if (!this.VRMConfig.selectedModelId && result.models.length > 0) {
          this.VRMConfig.selectedModelId = result.models[0].id;
        }
        await this.autoSaveSettings();
      }
    } catch (error) {
      console.error('Failed to load default models:', error);
    }
  },

  // Upload VRM model
  async uploadVrmModel() {
    if (!this.newVrmModel.file) {
      showNotification('Select a VRM model file first', 'error');
      return;
    }
    
    if (!this.newVrmModel.displayName.trim()) {
      showNotification('Enter a model display name', 'error');
      return;
    }
    
    const formData = new FormData();
    formData.append('file', this.newVrmModel.file);
    formData.append('display_name', this.newVrmModel.displayName.trim());
    
    try {
      const response = await fetch(`/upload_vrm_model`, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Add model to user model list
        const newModelOption = {
          id: result.file.unique_filename,
          name: result.file.display_name,
          path: result.file.path,
          type: 'user' // Mark user-uploaded model
        };
        
        this.VRMConfig.userModels.push(newModelOption);
        
        // Close dialog and reset state
        this.cancelVrmModelUpload();
        
        // Autosave settings
        await this.autoSaveSettings();
        
        showNotification('VRM model uploaded');
      } else {
        showNotification(`Upload failed: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('VRM model upload failed:', error);
      showNotification('Upload failed. Check the network connection.', 'error');
    }
  },
  
  // Delete only user-uploaded models
  async deleteModelOption(modelId) {
    try {
      // Find model only in user model list
      const modelIndex = this.VRMConfig.userModels.findIndex(
        model => model.id === modelId
      );
      
      if (modelIndex === -1) {
        showNotification('Cannot delete the default model', 'error');
        return;
      }
      
      // Call deletion API
      const response = await fetch(`/delete_vrm_model/${modelId}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Remove from user model list
        this.VRMConfig.userModels.splice(modelIndex, 1);
        
        // Reset to default if selected model was deleted
        if (this.VRMConfig.selectedModelId === modelId) {
          if (this.VRMConfig.defaultModels.length > 0) {
            this.VRMConfig.selectedModelId = this.VRMConfig.defaultModels[0].id;
          } else {
            this.VRMConfig.selectedModelId = '';
          }
        }
        
        // Autosave settings
        await this.autoSaveSettings();
        
        showNotification('VRM model deleted');
      } else {
        showNotification(`Deletion failed: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('VRM model deletion failed:', error);
      showNotification('Deletion failed. Try again later.', 'error');
    }
  },

  // ========== THA Desktop Pet Methods ==========
  async startTHA() {
    if (this.isTHAStarting) return;
    if (this.isElectron) {
      this.THAConfig.name = 'default';
      await this.autoSaveSettings();
      try {
        this.isTHAStarting = true;
        const windowConfig = {
          width: this.THAConfig.windowWidth,
          height: this.THAConfig.windowHeight,
        };
        await window.electronAPI.startTHAWindow(windowConfig);
      } catch (error) {
        console.error('THA startup failed:', error);
      } finally {
        this.isTHAStarting = false;
      }
    } else {
      window.open(`${this.partyURL}/tha.html`, '_blank');
    }
  },

  async startTHAweb() {
    if (this.isElectron) {
      window.electronAPI.openExternal(`${this.partyURL}/tha.html`);
    } else {
      window.open(`${this.partyURL}/tha.html`, '_blank');
    }
  },

  async stopTHA() {
    if (this.isElectron) {
      try {
        await window.electronAPI.stopTHAWindow();
      } catch (error) {
        console.error('THA shutdown failed:', error);
      }
    }
  },

  async startSoulx() {
    if (this.isSoulxStarting) return;
    if (this.isElectron) {
      this.SoulxConfig.name = 'default';
      await this.autoSaveSettings();
      try {
        this.isSoulxStarting = true;
        const windowConfig = {
          width: this.SoulxConfig.windowWidth,
          height: this.SoulxConfig.windowHeight,
        };
        await window.electronAPI.startSoulxWindow(windowConfig);
      } catch (error) {
        console.error('SoulX startup failed:', error);
      } finally {
        this.isSoulxStarting = false;
      }
    } else {
      window.open(`${this.partyURL}/soulx.html`, '_blank');
    }
  },

  async startSoulxweb() {
    if (this.isElectron) {
      window.electronAPI.openExternal(`${this.partyURL}/soulx.html`);
    } else {
      window.open(`${this.partyURL}/soulx.html`, '_blank');
    }
  },

  async stopSoulx() {
    if (this.isElectron) {
      try {
        await window.electronAPI.stopSoulxWindow();
      } catch (error) {
        console.error('SoulX shutdown failed:', error);
      }
    }
  },

  async loadSoulxImages() {
    try {
      const res = await fetch('/get_soulx_images');
      const data = await res.json();
      if (data.success) {
        this.SoulxConfig.images = data.images || [];
        // Migrate old single-image Base64 SQLite storage to multi-image management
        if (this.SoulxConfig.images.length === 0 && this.SoulxConfig.condImage) {
          await this.migrateLegacySoulxImage();
        }
        // Fall back to first image if selection is invalid
        const ids = this.SoulxConfig.images.map(i => i.id);
        if (this.SoulxConfig.selectedImageId && !ids.includes(this.SoulxConfig.selectedImageId)) {
          this.SoulxConfig.selectedImageId = ids[0] || '';
          await this.autoSaveSettings();
        }
      }
    } catch (error) {
      console.error('Failed to load SoulX reference images:', error);
    }
  },

  async migrateLegacySoulxImage() {
    try {
      const byteString = atob(this.SoulxConfig.condImage);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'image/png' });
      const formData = new FormData();
      formData.append('file', blob, 'legacy.png');
      formData.append('display_name', 'Default appearance');
      const response = await fetch('/upload_soulx_image', { method: 'POST', body: formData });
      const result = await response.json();
      if (result.success) {
        this.SoulxConfig.images = [result.image];
        this.SoulxConfig.selectedImageId = result.image.id;
        this.SoulxConfig.condImage = '';
        await this.autoSaveSettings();
      }
    } catch (error) {
      console.error('Legacy SoulX reference image migration failed:', error);
    }
  },

  async uploadSoulxImage() {
    if (!this.newSoulxImage.file) {
      showNotification('Select an image file first', 'error');
      return;
    }
    const formData = new FormData();
    formData.append('file', this.newSoulxImage.file);
    formData.append('display_name', this.newSoulxImage.displayName.trim() || this.newSoulxImage.name.replace(/\.[^.]+$/, ''));

    try {
      const response = await fetch('/upload_soulx_image', { method: 'POST', body: formData });
      const result = await response.json();
      if (result.success) {
        this.SoulxConfig.images.push(result.image);
        this.SoulxConfig.selectedImageId = result.image.id;
        this.cancelSoulxImageUpload();
        await this.autoSaveSettings();
        showNotification('Reference image uploaded');
      } else {
        showNotification(`Upload failed: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('SoulX reference image upload failed:', error);
      showNotification('Upload failed. Check the network connection.', 'error');
    }
  },

  async deleteSoulxImage(imageId) {
    try {
      const img = this.SoulxConfig.images.find(i => i.id === imageId);
      if (img && img.default) {
        showNotification('The default avatar cannot be deleted', 'warning');
        return;
      }
      const response = await fetch(`/delete_soulx_image/${imageId}`, { method: 'DELETE' });
      const result = await response.json();
      if (result.success) {
        const idx = this.SoulxConfig.images.findIndex(i => i.id === imageId);
        if (idx !== -1) this.SoulxConfig.images.splice(idx, 1);
        if (this.SoulxConfig.selectedImageId === imageId) {
          this.SoulxConfig.selectedImageId = this.SoulxConfig.images.length > 0 ? this.SoulxConfig.images[0].id : '';
        }
        await this.autoSaveSettings();
        showNotification('Reference image deleted');
      } else {
        showNotification(`Deletion failed: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('SoulX reference image deletion failed:', error);
      showNotification('Deletion failed. Try again later.', 'error');
    }
  },

  handleSoulxImageFileDrop(event) {
    const files = event.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      this.newSoulxImage.file = files[0];
      this.newSoulxImage.name = files[0].name;
      if (!this.newSoulxImage.displayName) {
        this.newSoulxImage.displayName = files[0].name.replace(/\.[^.]+$/, '');
      }
    }
  },

  browseSoulxImageFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      if (e.target.files.length > 0) {
        this.newSoulxImage.file = e.target.files[0];
        this.newSoulxImage.name = e.target.files[0].name;
        if (!this.newSoulxImage.displayName) {
          this.newSoulxImage.displayName = e.target.files[0].name.replace(/\.[^.]+$/, '');
        }
      }
    };
    input.click();
  },

  cancelSoulxImageUpload() {
    this.newSoulxImage = { file: null, name: '', displayName: '' };
    this.showSoulxImageDialog = false;
  },

  async uploadTHAModel() {
    if (!this.newThaModel.file) {
      showNotification('Select an ONNX model file first', 'error');
      return;
    }
    if (!this.newThaModel.displayName.trim()) {
      showNotification('Enter a model display name', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', this.newThaModel.file);
    formData.append('display_name', this.newThaModel.displayName.trim());

    try {
      const response = await fetch('/upload_tha_model', {
        method: 'POST',
        body: formData
      });
      const result = await response.json();

      if (result.success) {
        const newModelOption = {
          id: result.model.id,
          name: result.model.name,
          type: 'user'
        };
        this.THAConfig.userModels.push(newModelOption);
        this.cancelTHAModelUpload();
        await this.autoSaveSettings();
        showNotification('THA model uploaded');
        await this.loadTHAModels();
      } else {
        showNotification(`Upload failed: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('THA model upload failed:', error);
      showNotification('Upload failed. Check the network connection.', 'error');
    }
  },

  async deleteTHAModel(modelId) {
    try {
      const modelIndex = this.THAConfig.userModels.findIndex(
        model => model.id === modelId
      );
      if (modelIndex === -1) {
        showNotification('Cannot delete the default model', 'error');
        return;
      }

      const response = await fetch(`/delete_tha_model/${modelId}`, {
        method: 'DELETE'
      });
      const result = await response.json();

      if (result.success) {
        this.THAConfig.userModels.splice(modelIndex, 1);
        if (this.THAConfig.selectedModelId === modelId) {
          if (this.THAConfig.defaultModels.length > 0) {
            this.THAConfig.selectedModelId = this.THAConfig.defaultModels[0].id;
          } else {
            this.THAConfig.selectedModelId = '';
          }
        }
        await this.autoSaveSettings();
        showNotification('THA model deleted');
      } else {
        showNotification(`Deletion failed: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('THA model deletion failed:', error);
      showNotification('Deletion failed. Try again later.', 'error');
    }
  },

  async loadTHAModels() {
    try {
      const [defaultRes, userRes] = await Promise.all([
        fetch('/get_default_tha_models'),
        fetch('/get_user_tha_models')
      ]);
      const defaultData = await defaultRes.json();
      const userData = await userRes.json();

      if (defaultData.success) {
        this.THAConfig.defaultModels = defaultData.models;
      }
      if (userData.success) {
        this.THAConfig.userModels = userData.models;
      }
    } catch (error) {
      console.error('Failed to load THA models:', error);
    }
  },

  handleTHAModelFileDrop(event) {
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      this.newThaModel.file = files[0];
      this.newThaModel.name = files[0].name;
    }
  },

  browseTHAModelFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.onnx,.zip';
    input.onchange = (e) => {
      if (e.target.files.length > 0) {
        this.newThaModel.file = e.target.files[0];
        this.newThaModel.name = e.target.files[0].name;
      }
    };
    input.click();
  },

  cancelTHAModelUpload() {
    this.newThaModel = { file: null, displayName: '' };
    this.showThaModelDialog = false;
  },

  removeNewTHAModel() {
    this.newThaModel.file = null;
    this.newThaModel.name = '';
  },

  // Get selected model information
  getCurrentSelectedModel() {
    // Search default models first
    let selectedModel = this.VRMConfig.defaultModels.find(
      model => model.id === this.VRMConfig.selectedModelId
    );
    
    // If not found, search user models
    if (!selectedModel) {
      selectedModel = this.VRMConfig.userModels.find(
        model => model.id === this.VRMConfig.selectedModelId
      );
    }
    
    return selectedModel;
  },
  // Start livestream listener
  async startLive() {
    if (!this.isLiveConfigValid || this.isLiveRunning || this.isLiveStarting) {
      return;
    }

    this.isLiveStarting = true;
    
    try {
      // Send start request to FastAPI backend
      const response = await fetch('/api/live/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: this.liveConfig
        })
      });

      const result = await response.json();
      
      if (result.success) {
        this.isLiveRunning = true;
        this.shouldReconnectWs = true; // Allow reconnect after startup
        this.connectLiveWebSocket();
        this.startDanmuProcessor(); // Start livestream message processor
        showNotification(result.message || this.t('live_started_successfully'));
      } else {
        showNotification(result.message || this.t('failed_to_start_live'), 'error');
      }
    } catch (error) {
      console.error('Livestream listener startup failed:', error);
      showNotification(this.t('failed_to_start_live'), 'error');
    } finally {
      this.isLiveStarting = false;
    }
  },

  // Stop livestream listener
  async stopLive() {
    if (!this.isLiveRunning || this.isLiveStopping) {
      return;
    }

    this.isLiveStopping = true;
    
    try {
      // Update state first to prevent WebSocket reconnection
      this.shouldReconnectWs = false;
      this.isLiveRunning = false;
      
      // Stop livestream message processor
      this.stopDanmuProcessor();
      
      // Close WebSocket
      this.disconnectLiveWebSocket();
      
      // Send stop request to backend
      const response = await fetch('/api/live/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const result = await response.json();
      
      if (result.success) {
        this.danmu = []; // Clear livestream messages
        showNotification(result.message || this.t('live_stopped_successfully'));
      } else {
        showNotification(result.message || this.t('failed_to_stop_live'), 'error');
        // Restore state if backend stop fails
        this.isLiveRunning = true;
        this.shouldReconnectWs = true;
        this.startDanmuProcessor(); // Restart livestream message processor
      }
    } catch (error) {
      console.error('Livestream listener shutdown failed:', error);
      showNotification(this.t('failed_to_stop_live'), 'error');
      // Restore state on error
      this.isLiveRunning = true;
      this.shouldReconnectWs = true;
      this.startDanmuProcessor(); // Restart livestream message processor
    } finally {
      this.isLiveStopping = false;
    }
  },

  // Reload livestream configuration
  async reloadLiveConfig() {
    if (!this.isLiveRunning || this.isLiveReloading) {
      return;
    }

    this.isLiveReloading = true;
    
    try {
      const response = await fetch('/api/live/reload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: this.liveConfig
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // Reconnect WebSocket
        this.shouldReconnectWs = false; // Prevent reconnect initially
        this.disconnectLiveWebSocket();
        
        setTimeout(() => {
          this.shouldReconnectWs = true; // Allow reconnect again
          this.connectLiveWebSocket();
        }, 1000);
        
        showNotification(result.message || this.t('live_config_reloaded_successfully'));
      } else {
        showNotification(result.message || this.t('failed_to_reload_live_config'), 'error');
      }
    } catch (error) {
      console.error('Livestream configuration reload failed:', error);
      showNotification(this.t('failed_to_reload_live_config'), 'error');
    } finally {
      this.isLiveReloading = false;
    }
  },

  /**
   * Trim the queue to the newest N items without dropping extension requests (source === 'director').
   *
   * Director requests are pushed to the tail, which is the next item processed.
   * Trimming with slice(0, limit) retains the front and removes the tail.
   * Without the exemption, another viewer message could drop a director request (default limit 5).
   */
  trimDanmuQueue() {
    const limit = this.liveConfig.danmakuQueueLimit || 5;
    if (this.danmu.length <= limit) return;
    const keep = this.danmu.slice(0, limit);
    const pinned = this.danmu.slice(limit).filter((d) => d && d.source === 'director');
    this.danmu = keep.concat(pinned);
  },

  /**
   * Extension requests such as sap-snack-director arrive via live_enqueue over /ws.
   * Enqueue them rather than calling sendMessage directly.
   *
   * Why set_user_input and trigger_send_message are insufficient:
   * - sendMessage calls stopAllAudioPlayback and clears TTSrunning,
   *   interrupting speech already playing.
   * - sendMessage returns early if isTyping, silently discarding requests during generation,
   *   even though the caller thinks it was submitted.
   * processDanmuQueue gates on isTyping, TTSrunning and isProcessingDanmu,
   * serializing queued requests to resolve both problems.
   *
   * Retain at most one director request: newer requests replace obsolete game-state requests.
   */
  enqueueLiveRequest(payload) {
    const text = String((payload && payload.text) || '').trim();
    if (!text) return;

    this.danmu = this.danmu.filter((d) => !d || d.source !== 'director');
    this.danmu.push({
      id: (payload && payload.id) || ('director-' + Date.now()),
      content: text,
      type: (payload && payload.source) || 'director',
      platform: (payload && payload.platform) || 'director',
      source: 'director',
      // Exclude long prompt text from the OBS chat overlay by default
      silent: payload ? payload.silent !== false : true,
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false, hourCycle: 'h23' })
    });
    this.trimDanmuQueue();

    // Ensure the timer exists even when the livestream panel is disabled
    this.startDanmuProcessor();
    // Process immediately when idle; otherwise wait for the next one-second tick
    this.processDanmuQueue();
  },

  // Start livestream message processor
  startDanmuProcessor() {
    console.log('Starting livestream message processor');
    
    // Clear an existing timer first
    if (this.danmuProcessTimer) {
      clearInterval(this.danmuProcessTimer);
    }
    
    // Check queue every second
    this.danmuProcessTimer = setInterval(async () => {
      await this.processDanmuQueue();
    }, 1000);
  },

  // Stop livestream message processor
  stopDanmuProcessor() {
    console.log('Stopping livestream message processor');
    
    if (this.danmuProcessTimer) {
      clearInterval(this.danmuProcessTimer);
      this.danmuProcessTimer = null;
    }
    
    this.isProcessingDanmu = false;
  },

// 1. Copy URL
  copyDanmakuOverlayEndpoint() {
    const url = this.partyURL + '/danmaku_overlay';
    navigator.clipboard.writeText(url).then(() => {
      if(typeof showNotification === 'function') showNotification(this.t('copySuccess') || 'Copied!', 'success');
    }).catch(() => {
      if(typeof showNotification === 'function') showNotification('Copy failed', 'error');
    });
  },

copySubtitleOverlayEndpoint(){
  const url =  this.partyURL + '/subtitle_overlay';
  navigator.clipboard.writeText(url).then(() => {
    if(typeof showNotification === 'function') showNotification(this.t('copySuccess') || 'Copied!', 'success');
  }).catch(() => {
    if(typeof showNotification === 'function') showNotification('Copy failed', 'error');
  });
},

copyMinimalEndpoint(){
  const url = this.partyURL + '/minimal.html';
  navigator.clipboard.writeText(url).then(() => {
    if(typeof showNotification === 'function') showNotification(this.t('copySuccess') || 'Copied!', 'success');
  }).catch(() => {
    if(typeof showNotification === 'function') showNotification('Copy failed', 'error');
  });
},

copyIslandEndpoint(){
  const url = this.partyURL + '/island.html';
  navigator.clipboard.writeText(url).then(() => {
    if(typeof showNotification === 'function') showNotification(this.t('copySuccess') || 'Copied!', 'success');
  }).catch(() => {
    if(typeof showNotification === 'function') showNotification('Copy failed', 'error');
  });
},

  hasActiveTTSPlayback() {
    return Boolean(
      this.isOmniPlaying ||
      this.readState?.isPlaying ||
      (this.messages || []).some(message => {
        if (!message) return false;
        const audio = message._currentAudio;
        const audioPlaying = audio && typeof audio.paused === 'boolean' && !audio.paused;
        return message._ttsRunning || message.isPlaying || audioPlaying;
      })
    );
  },

// Livestream message queue processing
  /**
   * Remove the exact processed item by reference rather than pop().
   *
   * Removal must use identity; do not call this.danmu.pop().
   *
   * The queue can change while awaiting sendMessage: viewer messages are unshifted,
   * extension requests are pushed, so pop may remove a different item.
   * Observed on 2026-10-07: while A was processing, extension request B was pushed;
   * pop removed B after A finished, silently discarding the request.
   *
   * Previously pop worked because viewer messages always went to the front,
   * but extension requests at the tail invalidate that assumption.
   */
  removeDanmuItem(item) {
    if (!item) return;
    const i = this.danmu.indexOf(item);
    if (i >= 0) this.danmu.splice(i, 1);
  },

  async processDanmuQueue() {
    let processing = null;
    try {
      const hasStaleTTSLock = this.TTSrunning &&
          this.ttsSettings.enabled &&
          !this.hasActiveTTSPlayback();

      if (hasStaleTTSLock) {
        console.warn('Detected stale TTS lock before processing danmu queue; releasing it.');
        this.TTSrunning = false;
      }

      /**
       * Do not dequeue while generating, speaking or processing an item.
       * This ensures extension requests wait rather than interrupting the assistant.
       *
       * isLiveRunning should gate viewer messages only; extension director requests
       * must work even when the livestream panel is disabled.
       */
      if ((!this.isLiveRunning && !this.danmu.some((d) => d && d.source === 'director')) || this.danmu.length === 0 || this.isTyping || 
          (this.TTSrunning && this.ttsSettings.enabled) || this.isProcessingDanmu) {
        return;
      }

      this.isProcessingDanmu = true;
      const oldestDanmu = this.danmu[this.danmu.length - 1];
      processing = oldestDanmu;
      
      if (oldestDanmu && oldestDanmu.content) {
        // Deduplicate consecutive viewer messages only; extension requests have unique IDs
        if (oldestDanmu.source !== 'director' && this.lastProcessedContent === oldestDanmu.content) {
            this.removeDanmuItem(processing);
            this.isProcessingDanmu = false;
            return;
        }

        console.log('Processing livestream message:', oldestDanmu.content);
        this.lastProcessedContent = oldestDanmu.content;
        
        // Save message temporarily for TTS queue injection
        this.pendingDanmakuToRead = oldestDanmu.content;

        // Set model input
        this.userInput = oldestDanmu.content;
        
        // Trigger OBS popup through backend API.
        // Silent extension requests do not appear in the overlay.
        if (!oldestDanmu.silent) {
          try {
              fetch('/api/overlay/danmaku', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(oldestDanmu)
              }).catch(()=>{});
          } catch(e) {}
        }

        // Submit message and start generation
        await this.sendMessage();
        
        this.removeDanmuItem(processing); 
      }
    } catch (error) {
      console.error('Livestream message processing failed:', error);
      this.removeDanmuItem(processing); 
    } finally {
      this.isProcessingDanmu = false;
    }
  },
  // Connect WebSocket
  connectLiveWebSocket() {
    try {
      // Choose ws or wss based on current protocol
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/live/danmu`;
      
      this.liveWs = new WebSocket(wsUrl);
      
      this.liveWs.onopen = (event) => {
        console.log('WebSocket connected');
      };
      
      this.liveWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleDanmuMessage(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
      
      this.liveWs.onclose = (event) => {
        console.log('WebSocket disconnected');
        
        // Reconnect only if enabled and livestream is running
        if (this.shouldReconnectWs && this.isLiveRunning) {
          console.log('Preparing WebSocket reconnection...');
          setTimeout(() => {
            // Recheck state before reconnecting
            if (this.shouldReconnectWs && this.isLiveRunning) {
              console.log('Reconnecting WebSocket');
              this.connectLiveWebSocket();
            } else {
              console.log('WebSocket reconnection cancelled');
            }
          }, 3000);
        } else {
          console.log('WebSocket reconnection not required');
        }
      };
      
      this.liveWs.onerror = (error) => {
        console.error('WebSocket connection error:', error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
    }
  },

  // Disconnect WebSocket
  disconnectLiveWebSocket() {
    console.log('Disconnecting WebSocket');
    
    if (this.liveWs) {
      // Clear reference first to avoid reconnecting in onclose
      const ws = this.liveWs;
      this.liveWs = null;
      
      // Close connection
      ws.close();
    }
  },

  async checkLiveStatus() {
    try {
      const response = await fetch('/api/live/status');
      const result = await response.json();
      
      // Update state
      this.isLiveRunning = result.is_running;

      // Restore WebSocket and processor after refresh if backend is running
      if (this.isLiveRunning) {
        console.log('Livestream listener is running; restoring connection...');
        this.shouldReconnectWs = true;
        
        // Reconnect WebSocket for incoming messages
        this.connectLiveWebSocket();
        
        // Restart queue processing timer
        this.startDanmuProcessor();
      }
    } catch (error) {
      console.error('Livestream status check failed:', error);
    }
  },

  // Handle livestream messages
  handleDanmuMessage(data) {
    if (data.type !== 'message') {
      if (data.type === 'error') showNotification(data.message, 'error');
      return;
    }

    // --- 1. Deduplicate IDs ---
    if (data.id) {
      if (this.receivedMsgIds.has(data.id)) return;
      this.receivedMsgIds.add(data.id);
      if (this.receivedMsgIds.size > 500) {
        const firstVal = this.receivedMsgIds.values().next().value;
        this.receivedMsgIds.delete(firstVal);
      }
    }

    // --- 2. Normalize message properties ---
    const danmuType = data.danmu_type; // danmaku, super_chat, gift, buy_guard, enter_room, follow, like
    const isDanmaku = (danmuType === "danmaku" || danmuType === "super_chat");
    const isPaid = (danmuType === "gift" || danmuType === "buy_guard" || danmuType === "super_chat");
    const isInteraction = (danmuType === "enter_room" || danmuType === "follow" || danmuType === "like");

    // --- 3. Filter by mode ---
    let modePass = false;
    const mode = this.liveConfig.filterMode || 'all';

    if (mode === 'all') {
      modePass = true;
    } else if (mode === 'danmaku_paid') {
      modePass = (isDanmaku || isPaid);
    } else if (mode === 'danmaku_only') {
      modePass = isDanmaku;
    }

    if (!modePass) return;

    // --- 4. Check wake words for text messages only ---
    const wakeStr = this.liveConfig.wakeWord || "";
    const wakeKeywords = wakeStr.split(/[\r\n]+/).map(k => k.trim()).filter(k => k.length > 0);
    
    const isMatchWakeWord = (text) => {
      if (wakeKeywords.length === 0) return true;
      return wakeKeywords.some(keyword => text.includes(keyword));
    };

    let shouldAdd = false;
    if (isDanmaku) {
      // Chat and Super Chat must match wake words
      if (isMatchWakeWord(data.content)) shouldAdd = true;
    } else {
      // Allow gifts, subscriptions, follows and other interactions without wake words
      shouldAdd = true;
    }

    // --- 5. Enqueue ---
    if (shouldAdd) {
      const danmuItem = {
        id: data.id,
        content: data.content,
        type: danmuType,
        platform: data.platform || 'unknown',
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false, hourCycle: 'h23' })
      };

      // Prevent repeated-message spam
      if (this.danmu.length > 0 && this.danmu[0].content === danmuItem.content) return;

      this.danmu.unshift(danmuItem);
      this.trimDanmuQueue();
    }
  },
  toggleBriefly(index){
    if (this.messages[index].briefly){
      this.messages[index].briefly = !this.messages[index].briefly;
    }else{
      this.messages[index].briefly = true;
    }
  },
  async rewrite(index){
      if (index != 1){
        // 1. Back up user message being regenerated
        const targetMsg = this.messages[index - 1];

        // 2. Remove messages at index and after
        this.messages.splice(index);

        // 3. Restore text
        this.userInput = this.messages[index-1]?.pure_content ?? this.messages[index-1]?.content ?? '';

        // 4. Restore file/image metadata without blobs to avoid reuploading
        this.files = targetMsg.fileLinks
          ? targetMsg.fileLinks.map(link => ({ name: link.name, path: link.path }))
          : [];
        this.images = targetMsg.imageLinks
          ? targetMsg.imageLinks.map(link => ({
              name: link.name,
              path: link.path,
              detectedType: link.detectedType   // Preserve type
            }))
          : [];

        // 5. Remove the original user message, now last in array
        this.messages.pop();
      } else {
        // Replace greeting
        this.randomGreetings();
      }

      await this.sendMessage();
  },
  async updateProxy(){
    await this.autoSaveSettings();
    const response = await fetch('/api/update_proxy',{
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (response.ok) {
      const data = await response.json();
      console.log(data);
    }else {
      console.error('Proxy update failed');
    }
  },
  async openUserfile(){
    const response = await fetch('/api/get_userfile',{
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (response.ok) {
      // Get userfile
      const data = await response.json();
      let userfile = data.userfile;    // Open directory
      if (this.isElectron){
        window.electronAPI.openPath(userfile);
      }
    }
  },
  async openLogfile(){
    const response = await fetch('/api/get_userfile',{
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (response.ok) {
      // Get userfile
      const data = await response.json();
      let userfile = data.userfile;    // Open directory
      if (this.isElectron){
        window.electronAPI.openPath(userfile+'/logs');
      }
    }
  },
  async openExtfile(){
    const response = await fetch('/api/get_extfile',{
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (response.ok) {
      // Get extfile
      const data = await response.json();
      let extfile = data.extfile;    // Open directory
      if (this.isElectron){
        window.electronAPI.openPath(extfile);
      }
    }
  },
  async changeHAEnabled(){
    if (this.HASettings.enabled){
      const response = await fetch('/start_HA',{
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: this.HASettings
        })
      });
      if (response.ok) {
        const data = await response.json();
        console.log(data);
        showNotification(this.t('success_start_HA'));
      }else {
        this.HASettings.enabled = false;
        console.error('HA startup failed');
        showNotification(this.t('error_start_HA'), 'error');
      }
    }else{
      const response = await fetch('/stop_HA',{
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        console.log(data);
        showNotification(this.t('success_stop_HA'));
      }else {
        this.HASettings.enabled = true;
        console.error('HA shutdown failed');
        showNotification(this.t('error_stop_HA'), 'error');
      }
    }
    this.autoSaveSettings();
  },
  async changeChromeMCPEnabled(){

    if (this.chromeMCPSettings.enabled && this.chromeMCPSettings.type === 'internal' && this.isElectron) {
        if (!window.electronAPI) return;
        await this.autoSaveSettings();
        // CDP port is always active; synchronize its number
        const cdpInfo = await window.electronAPI.getInternalCDPInfo();
        if (cdpInfo.active) {
            this.chromeMCPSettings.CDPport = cdpInfo.port;
            console.log("[CDP] Starting MCP with active port: " + cdpInfo.port);
        }
        await this.autoSaveSettings();
        showNotification(this.t('success_start_browserControl'));
    }
    if (this.chromeMCPSettings.enabled && this.chromeMCPSettings.type === 'external'){
      const response = await fetch('/start_ChromeMCP',{
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: this.chromeMCPSettings
        })
      });
      if (response.ok){
        const data = await response.json();
        console.log(data);
        showNotification(this.t('success_start_browserControl'));
      }else {
        this.chromeMCPSettings.enabled = false;
        console.error('Chrome MCP startup failed');
        showNotification(this.t('error_start_browserControl'), 'error');
      }
    }else{
      const response = await fetch('/stop_ChromeMCP',{
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
      });
      if (response.ok){
        const data = await response.json();
        console.log(data);
        if (this.chromeMCPSettings.type === 'external'||!this.chromeMCPSettings.enabled){
          showNotification(this.t('success_stop_browserControl'));
        }
      }else {
        this.chromeMCPSettings.enabled = true;
        console.error('Chrome MCP shutdown failed');
        if (this.chromeMCPSettings.type === 'external'||!this.chromeMCPSettings.enabled){
          showNotification(this.t('error_stop_browserControl'), 'error');
        }
      }
    }
    this.autoSaveSettings();
  },

  async toggleLocalAppControl() {
    await this.autoSaveSettings();
    if (this.localAppControlSettings.enabled) {
      await this.syncAppConnections();
    }
  },

  async syncAppConnections() {
    try {
      const response = await fetch('/app-cdp-status');
      if (response.ok) {
        const data = await response.json();
        const livePorts = new Set((data.connections || []).map(c => c.port));
        let changed = false;
        for (const appId of Object.keys(this.localAppControlSettings.connectedApps)) {
          const conn = this.localAppControlSettings.connectedApps[appId];
          if (!livePorts.has(conn.port)) {
            delete this.localAppControlSettings.connectedApps[appId];
            changed = true;
          }
        }
        if (changed) {
          await this.autoSaveSettings();
        }
      }
    } catch (e) {
      console.error('Failed to synchronize connection state:', e);
    }
  },

  async smartConnectApp(app) {
    if (!this.isElectron || !window.electronAPI) {
      this.connectingAppId = null;
      showNotification('Electron is required', 'error');
      return;
    }
    if (this.connectingAppId) return; // Another application is connecting
    this.connectingAppId = app.id;
    console.log("[smartConnect] Connecting " + app.name + ", port=" + (app.cdpPort || this.localAppControlSettings.nextPort) + ", forceNewInstance=" + this.localAppControlSettings.forceNewInstance);
    showNotification(`Connecting to ${app.name}…`, 'info');
    const port = app.cdpPort || this.localAppControlSettings.nextPort;

    // 1. Try direct connection to an already-open port
    try {
      const resp = await fetch('/connect-app-cdp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: port, appId: app.id, appName: app.name })
      });
      if (resp.ok) {
        const d = await resp.json();
        if (d.success) {
          console.log("[smartConnect] " + app.name + " connected directly (port=" + port + ")");
          this.localAppControlSettings.connectedApps[app.id] = {
            appId: app.id, appName: app.name, port: port,
            targets: d.targets || [], usableCount: d.usableCount || 0,
            activeWsUrl: d.activeWsUrl || null, status: 'connected'
          };
          if (!app.cdpPort) { app.cdpPort = port; this.localAppControlSettings.nextPort = port + 1; }
          app.isRunning = true;
          await this.autoSaveSettings();
          showNotification(this.t('success_connect_app'));
          this.connectingAppId = null;
          return;
        }
      }
    } catch (e) {}
    console.log("[smartConnect] " + app.name + " direct connection failed; restarting for debugging");

    // 2. On direct connection failure, stop remaining processes and launch with debugging
    try { await window.electronAPI.quitAppProcess({ pid: app.pid || 0, path: app.path }); } catch (e) {}
    app.isRunning = false;
    app.pid = 0;
    await new Promise(r => setTimeout(r, 2500));

    app.cdpPort = port;
    this.localAppControlSettings.nextPort = port + 1;

    console.log("[smartConnect] " + app.name + " starting debugging (path=" + app.path + ", port=" + port + ")");
    const launchResult = await window.electronAPI.launchAppWithDebugging({
      path: app.path, port: port,
      forceNewInstance: this.localAppControlSettings.forceNewInstance
    });
    app.isRunning = !!launchResult?.success;
    app.pid = launchResult?.pid || app.pid;
    console.log("[smartConnect] " + app.name + " launch result: success=" + !!launchResult?.success + ", pid=" + launchResult?.pid + ", error=" + (launchResult?.error || 'none'));

    if (!launchResult?.success) {
      this.connectingAppId = null;
      let msg = app.name + ': Could not open debugging port; this application may not support CDP remote debugging';
      if (!this.localAppControlSettings.forceNewInstance) {
        msg += '. Try enabling Launch new instance (separate user data) and retrying';
      }
      showNotification(msg, 'error');
      return;
    }

    // 3. Poll connection up to three times
    console.log("[smartConnect] " + app.name + " launched; polling CDP up to three times");
    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const resp = await fetch('/connect-app-cdp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ port: port, appId: app.id, appName: app.name })
        });
        if (resp.ok) {
          const d = await resp.json();
          if (d.success) {
            console.log("[smartConnect] " + app.name + " connected on attempt " + (i+1) + " (port=" + port + ")");
            this.localAppControlSettings.connectedApps[app.id] = {
              appId: app.id, appName: app.name, port: port,
              targets: d.targets || [], usableCount: d.usableCount || 0,
              activeWsUrl: d.activeWsUrl || null, status: 'connected'
            };
            await this.autoSaveSettings();
            showNotification(this.t('success_connect_app'));
            this.connectingAppId = null;
            return;
          }
        }
      } catch (e) {}
    }
    this.connectingAppId = null;
    let msg = app.name + ': Connection timed out. Verify that the application supports CDP debugging';
    if (!this.localAppControlSettings.forceNewInstance) {
      msg += '. Try enabling Launch new instance (separate user data) and retrying';
    }
    showNotification(msg, 'error');
  },

  async scanLocalApps() {
    this.localAppControlSettings.scanning = true;
    showNotification('Scanning local applications. This may take several seconds…', 'info');
    try {
      const response = await fetch('/scan-local-apps', { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        // Merge manually added applications first, removing duplicates
        const scannedIds = new Set((data.apps || []).map(a => (a.path || '').toLowerCase()));
        const manualApps = (this.localAppControlSettings.manualApps || []).filter(a => {
          return !scannedIds.has((a.path || '').toLowerCase());
        });
        this.localAppControlSettings.scannedApps = [...manualApps, ...(data.apps || [])];
        const types = {};
        for (const a of data.apps) { types[a.appType] = (types[a.appType] || 0) + 1; }
        const typeStr = Object.entries(types).map(([k,v]) => `${k}=${v}`).join(' ');
        showNotification(this.t('success_scan_apps').replace('{count}', data.apps.length) + ` (${typeStr})`);
      } else { showNotification(this.t('error_launch_app'), 'error'); }
    } catch (e) {
      console.error('Local application scan failed:', e);
      showNotification(this.t('error_launch_app'), 'error');
    } finally { this.localAppControlSettings.scanning = false; }
    this.autoSaveSettings();
  },

  async addManualApp() {
    let path = (this.manualAppInput || '').trim();
    path = path.replace(/^["']|["']$/g, '');
    if (!path) return showNotification('Enter the application path', 'warning');
    const existing = (this.localAppControlSettings.manualApps || []).find(a => a.path.toLowerCase() === path.toLowerCase());
    if (existing) return showNotification('This path has already been added', 'warning');
    // Already in scan results; no manual addition needed
    const alreadyScanned = (this.localAppControlSettings.scannedApps || []).find(a => a.path.toLowerCase() === path.toLowerCase());
    if (alreadyScanned) return showNotification('This application is already listed', 'warning');
    try {
      const resp = await fetch('/validate-app-path', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
      if (!resp.ok) { showNotification('Validation request failed', 'error'); return; }
      const d = await resp.json();
      if (!d.valid) { showNotification(`Application could not be recognized: ${d.error}`, 'error'); return; }
      const app = { id: 'manual_' + Date.now(), name: d.name || path.split('\\').pop().replace('.exe',''), path: path, version: d.version || '', appType: d.appType || 'chromium', isElectron: d.appType === 'electron', isRunning: false, pid: 0, _manual: true };
      if (!this.localAppControlSettings.manualApps) this.localAppControlSettings.manualApps = [];
      this.localAppControlSettings.manualApps.push(app);
      this.localAppControlSettings.scannedApps = [app, ...(this.localAppControlSettings.scannedApps || [])];
      this.manualAppInput = '';
      showNotification(`Added ${app.name}`);
      this.autoSaveSettings();
    } catch (e) { showNotification('Validation failed: ' + e.message, 'error'); }
  },

  removeManualApp(app) {
    if (!app._manual) return;
    this.localAppControlSettings.manualApps = (this.localAppControlSettings.manualApps || []).filter(a => a.path !== app.path);
    this.localAppControlSettings.scannedApps = (this.localAppControlSettings.scannedApps || []).filter(a => !a._manual || a.path !== app.path);
    if (this.isAppConnected(app)) { delete this.localAppControlSettings.connectedApps[app.id]; }
    this.autoSaveSettings();
    showNotification('Removed');
  },

  async launchAppWithCDP(app) {
    if (!this.isElectron || !window.electronAPI) return;
    try {
      const port = this.localAppControlSettings.nextPort;
      const result = await window.electronAPI.launchAppWithDebugging({ path: app.path, port: port });
      if (result && result.success) {
        app.isRunning = true;
        app.cdpPort = port;
        this.localAppControlSettings.nextPort = port + 1;
        showNotification(this.t('success_launch_app'));
      } else {
        showNotification(this.t('error_launch_app'), 'error');
      }
    } catch (e) {
      console.error('Application launch failed:', e);
      showNotification(this.t('error_launch_app'), 'error');
    }
    this.autoSaveSettings();
  },

  async connectToApp(app) {
    if (!app.cdpPort) {
      app.cdpPort = this.localAppControlSettings.nextPort;
      this.localAppControlSettings.nextPort = app.cdpPort + 1;
    }
    try {
      const response = await fetch('/connect-app-cdp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: app.cdpPort, appId: app.id, appName: app.name })
      });
      if (response.ok) {
        const data = await response.json();
        if (!data.success) {
          showNotification(this.t('error_connect_app') + ': ' + (data.error || ''), 'error');
          return;
        }
        this.localAppControlSettings.connectedApps[app.id] = {
          appId: app.id,
          appName: app.name,
          port: app.cdpPort,
          targets: data.targets || [],
          usableCount: data.usableCount || 0,
          activeWsUrl: data.activeWsUrl || null,
          status: 'connected'
        };
        app.isRunning = true;
        await this.autoSaveSettings();
        showNotification(this.t('success_connect_app'));
      } else {
        showNotification(this.t('error_connect_app'), 'error');
      }
    } catch (e) {
      console.error('Application connection failed:', e);
      showNotification(this.t('error_connect_app'), 'error');
    }
  },

  async disconnectFromApp(app) {
    const conn = this.localAppControlSettings.connectedApps[app.id];
    const port = conn ? conn.port : app.cdpPort;
    if (!port) {
      showNotification(this.t('error_disconnect_app'), 'error');
      return;
    }
    try {
      const response = await fetch('/disconnect-app-cdp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: port, appId: app.id })
      });
      if (response.ok) {
        delete this.localAppControlSettings.connectedApps[app.id];
        await this.autoSaveSettings();
        showNotification(this.t('success_disconnect_app'));
      } else {
        showNotification(this.t('error_disconnect_app'), 'error');
      }
    } catch (e) {
      console.error('Application disconnection failed:', e);
      showNotification(this.t('error_disconnect_app'), 'error');
    }
  },

  async quitLocalApp(app) {
    if (!this.isElectron || !window.electronAPI) return;
    // If connected, disconnect from CDP backend first
    if (this.isAppConnected(app)) {
      try {
        await fetch('/disconnect-app-cdp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ port: this.localAppControlSettings.connectedApps[app.id]?.port, appId: app.id })
        });
      } catch (e) {}
    }
    try {
      const result = await window.electronAPI.quitAppProcess({ pid: app.pid, path: app.path });
      if (result && result.success) {
        app.isRunning = false;
        app.pid = 0;
        delete this.localAppControlSettings.connectedApps[app.id];
        showNotification(this.t('success_quit_app'));
      } else {
        showNotification(this.t('error_quit_app'), 'error');
      }
    } catch (e) {
      console.error('Application exit failed:', e);
      showNotification(this.t('error_quit_app'), 'error');
    }
    this.autoSaveSettings();
  },

  isAppConnected(app) {
    return !!this.localAppControlSettings.connectedApps[app.id];
  },

  getAppPort(app) {
    const conn = this.localAppControlSettings.connectedApps[app.id];
    return conn ? conn.port : (app.cdpPort || '');
  },

  getAppPages(app) {
    const conn = this.localAppControlSettings.connectedApps[app.id];
    if (!conn || !conn.targets) return [];
    return conn.targets.filter(t => t.webSocketDebuggerUrl && !['worker', 'service_worker', 'shared_worker'].includes(t.type));
  },

  async selectAppPage(app, page) {
    if (!page.id) return;
    const conn = this.localAppControlSettings.connectedApps[app.id];
    if (!conn) return;
    try {
      const response = await fetch('/switch-external-target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: conn.port, targetId: page.id })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          conn.activeWsUrl = page.webSocketDebuggerUrl;
          showNotification('Target changed');
        }
      }
    } catch (e) {
      console.error('Target switch failed:', e);
    }
  },

  async refreshAppTargets(app) {
    const conn = this.localAppControlSettings.connectedApps[app.id];
    if (!conn) return;
    try {
      const response = await fetch('/refresh-external-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: conn.port })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.targets) {
          conn.targets = data.targets;
        }
      }
    } catch (e) {
      console.error('Target refresh failed:', e);
    }
  },

  async screenshotApp(app) {
    try {
      const response = await fetch('/execute-external-cdp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: this.getAppPort(app), method: 'Page.captureScreenshot', params: {} })
      });
      if (response.ok) {
        showNotification('Screenshot captured');
      }
    } catch (e) {
      console.error('Screenshot failed:', e);
    }
  },

  async snapshotApp(app) {
    try {
      const response = await fetch('/execute-external-cdp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: this.getAppPort(app), method: 'Runtime.evaluate', params: { expression: 'document.body.innerText', returnByValue: true } })
      });
      if (response.ok) {
        showNotification('Snapshot captured');
      }
    } catch (e) {
      console.error('Snapshot failed:', e);
    }
  },

  async executeJSInApp(app) {
    const conn = this.localAppControlSettings.connectedApps[app.id];
    if (!conn || !conn.wsUrl) {
      showNotification('Select an application page first', 'warning');
      return;
    }
    try {
      const response = await fetch('/execute-external-cdp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: this.getAppPort(app), method: 'Runtime.evaluate', params: { expression: '1 + 1', returnByValue: true } })
      });
      if (response.ok) {
        showNotification('Execution successful');
      }
    } catch (e) {
      console.error('JavaScript execution failed:', e);
    }
  },

  async changeSqlEnabled() {
    if (this.sqlSettings.enabled) {
      
      // ==========================================
      // 1. Validate before startup
      // ==========================================
      const settings = this.sqlSettings;
      let errorMsg = '';

      if (settings.engine === 'sqlite') {
        // SQLite requires dbpath only
        if (!settings.dbpath?.trim()) {
          errorMsg = this.t('pleaseConfigSqliteDbpath');
        }
      } else {
        // Other databases require host, port, user, password and dbname
        if (!settings.host?.trim()) {
          errorMsg = this.t('pleaseConfigSqlHost');
        } else if (settings.port === undefined || settings.port === null || settings.port === '') {
          errorMsg = this.t('pleaseConfigSqlPort');
        } else if (!settings.user?.trim()) {
          errorMsg = this.t('pleaseConfigSqlUser');
        } else if (!settings.password?.trim()) {
          errorMsg = this.t('pleaseConfigSqlPassword');
        } else if (!settings.dbname?.trim()) {
          errorMsg = this.t('pleaseConfigSqlDbname');
        }
      }

      // On validation failure, show error, reset toggle and stop
      if (errorMsg) {
        const errorTitle = this.t ? this.t('configIncomplete') : 'Configuration Incomplete';
        showNotification(errorMsg, 'error', errorTitle);

        this.$nextTick(() => {
          this.sqlSettings.enabled = false;
        });
        
        return; // Return to prevent the fetch below
      }

      // ==========================================
      // 2. Startup after validation
      // ==========================================
      const response = await fetch('/start_sql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: this.sqlSettings
        })
      });
      if (response.ok) {
        const data = await response.json();
        console.log(data);
        showNotification(this.t('success_start_sqlControl'));
      } else {
        this.sqlSettings.enabled = false;
        console.error('SQL startup failed');
        showNotification(this.t('error_start_sqlControl'), 'error');
      }

    } else {
      
      // ==========================================
      // 3. Shutdown when the user disables the toggle
      // ==========================================
      const response = await fetch('/stop_sql', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
      });
      if (response.ok) {
        const data = await response.json();
        console.log(data);
        showNotification(this.t('success_stop_sqlControl'));
      } else {
        this.sqlSettings.enabled = true;
        console.error('SQL shutdown failed');
        showNotification(this.t('error_stop_sqlControl'), 'error');
      }
    }
    
    // ==========================================
    // 4. Save settings after success
    // ==========================================
    this.autoSaveSettings();
  },
  
    // Load default motions
  async loadDefaultMotions() {
    try {
      const response = await fetch(`/get_default_vrma_motions`);
      const result = await response.json();
      
      if (result.success) {
        this.VRMConfig.defaultMotions = result.motions;
        console.log('Default motions:', this.VRMConfig.defaultMotions);
        await this.autoSaveSettings();
      }
    } catch (error) {
      console.error('Failed to load default motions:', error);
    }
  },

  // Handle motion selection changes
  handleMotionChange(value) {
    console.log('Selected motion:', value);
    // Autosave settings
    this.autoSaveSettings();
  },

  // Browse VRMA motion files
  browseVrmaMotionFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vrma';
    input.multiple = true; // Allow multiple selection
    input.onchange = (event) => {
      const files = event.target.files;
      if (files.length > 0) {
        // If multiple files are selected, process the first
        const file = files[0];
        // Check extension
        if (!file.name.toLowerCase().endsWith('.vrma')) {
          showNotification('Only .vrma files are supported', 'error');
          return;
        }
        this.newVrmaMotion.name = file.name;
        this.newVrmaMotion.file = file;
        // Set display name without extension
        this.newVrmaMotion.displayName = file.name.replace(/\.vrma$/i, '');
      }
    };
    input.click();
  },

  // Handle VRMA motion drop
  handleVrmaMotionDrop(event) {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      // Check extension
      if (!file.name.toLowerCase().endsWith('.vrma')) {
        showNotification('Only .vrma files are supported', 'error');
        return;
      }
      this.newVrmaMotion.name = file.name;
      this.newVrmaMotion.file = file;
      // Set display name without extension
      this.newVrmaMotion.displayName = file.name.replace(/\.vrma$/i, '');
    }
  },

  // Remove selected VRMA motion
  removeNewVrmaMotion() {
    this.newVrmaMotion.name = '';
    this.newVrmaMotion.displayName = '';
    this.newVrmaMotion.file = null;
  },

  // Cancel VRMA upload
  cancelVrmaMotionUpload() {
    this.showVrmaMotionDialog = false;
    this.newVrmaMotion.name = '';
    this.newVrmaMotion.displayName = '';
    this.newVrmaMotion.file = null;
  },

  // Upload VRMA motion
  async uploadVrmaMotion() {
    if (!this.newVrmaMotion.file) {
      showNotification('Select a VRMA motion file first', 'error');
      return;
    }
    
    if (!this.newVrmaMotion.displayName.trim()) {
      showNotification('Enter a motion display name', 'error');
      return;
    }
    
    const formData = new FormData();
    formData.append('file', this.newVrmaMotion.file);
    formData.append('display_name', this.newVrmaMotion.displayName.trim());
    
    try {
      const response = await fetch(`/upload_vrma_motion`, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Add motion to user motion list
        const newMotionOption = {
          id: result.file.unique_filename,
          name: result.file.display_name,
          path: result.file.path,
          type: 'user' // Mark user-uploaded motion
        };
        
        this.VRMConfig.userMotions.push(newMotionOption);
        
        // Select newly uploaded motion
        if (!this.VRMConfig.selectedMotionIds.includes(newMotionOption.id)) {
          this.VRMConfig.selectedMotionIds.push(newMotionOption.id);
        }
        
        // Close dialog and reset state
        this.cancelVrmaMotionUpload();
        
        // Autosave settings
        await this.autoSaveSettings();
        
        showNotification('VRMA motion uploaded');
      } else {
        showNotification(`Upload failed: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('VRMA motion upload failed:', error);
      showNotification('Upload failed. Check the network connection.', 'error');
    }
  },

  // Delete user-uploaded motions only
  async deleteMotionOption(motionId) {
    try {
      // Find motion in user motion list
      const motionIndex = this.VRMConfig.userMotions.findIndex(
        motion => motion.id === motionId
      );
      
      // Call deletion API
      const response = await fetch(`/delete_vrma_motion/${motionId}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Remove from user motion list
        this.VRMConfig.userMotions.splice(motionIndex, 1);
        
        // Remove deleted motion from selection
        const selectedIndex = this.VRMConfig.selectedMotionIds.indexOf(motionId);
        if (selectedIndex > -1) {
          this.VRMConfig.selectedMotionIds.splice(selectedIndex, 1);
        }
        
        // Autosave settings
        await this.autoSaveSettings();
        
        showNotification(this.t("VRMAactionDeleted"));
      } else {
        showNotification(`error: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('VRMA motion deletion failed:', error);
      showNotification(error, 'error');
    }
  },

  // Get selected motion information
  getCurrentSelectedMotions() {
    const selectedMotions = [];
    
    // Search default motions
    this.VRMConfig.defaultMotions.forEach(motion => {
      if (this.VRMConfig.selectedMotionIds.includes(motion.id)) {
        selectedMotions.push(motion);
      }
    });
    
    // Search user motions
    this.VRMConfig.userMotions.forEach(motion => {
      if (this.VRMConfig.selectedMotionIds.includes(motion.id)) {
        selectedMotions.push(motion);
      }
    });
    
    return selectedMotions;
  },

  // Get all default and user-uploaded motions
  getAllAvailableMotions() {
    return [...this.VRMConfig.defaultMotions, ...this.VRMConfig.userMotions];
  },

  // Get motion information by ID
  getMotionById(motionId) {
    // Search default motions first
    let motion = this.VRMConfig.defaultMotions.find(m => m.id === motionId);
    
    // Then search user motions
    if (!motion) {
      motion = this.VRMConfig.userMotions.find(m => m.id === motionId);
    }
    
    return motion;
  },

/* Lifecycle: load scene list */
async loadGaussScenes() {
  const [def, user] = await Promise.all([
    fetch('/get_default_gauss_scenes').then(r => r.json()),
    fetch('/get_user_gauss_scenes').then(r => r.json())
  ]);
  this.VRMConfig.gaussDefaultScenes = def.scenes || [];
  this.VRMConfig.gaussUserScenes   = user.scenes || [];
  console.log("Default scenes:",this.VRMConfig.gaussDefaultScenes);
  if (!this.VRMConfig.selectedGaussSceneId) {
    this.VRMConfig.selectedGaussSceneId = 'transparent';
  }
  this.autoSaveSettings();
},
/* Switch background after scene selection */
async handleGaussSceneChange(sceneId) {
  // Store scene ID in VRMConfig like model selection
  this.VRMConfig.selectedGaussSceneId = sceneId;

  this.autoSaveSettings();
},

/* Upload area click */
browseGaussSceneFile() {
  const ipt = document.createElement('input');
  ipt.type = 'file';
  ipt.accept = '.ply,.spz,.splat,.ksplat,.sog';
  ipt.onchange = e => {
    const file = e.target.files[0];
    if (file) {
      this.newGaussScene.name = file.name;
      this.newGaussScene.file = file;   // Keep original File object
      this.newGaussScene.displayName = this.newGaussScene.displayName || this.newGaussScene.name;
    }
  };
  ipt.click();
},

/* Drag and drop upload */
handleGaussSceneDrop(e) {
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['ply','spz','splat','ksplat','sog'].includes(ext)) {
    return showNotification('Unsupported file type', 'error');
  }
  this.newGaussScene.name = file.name;
  this.newGaussScene.file = file;
  this.newGaussScene.displayName = this.newGaussScene.displayName || this.newGaussScene.name;
},

/* Remove pending upload */
removeNewGaussScene() {
  this.newGaussScene = { name: '', displayName: '' };
},

/* Upload */
async uploadGaussScene() {
  const fd = new FormData();
  fd.append('file', this.newGaussScene.file);
  fd.append('display_name', this.newGaussScene.displayName || this.newGaussScene.name);
  console.log("Uploading scene:",fd);
  const res = await fetch('/upload_gauss_scene', {
    method: 'POST',
    body: fd
  }).then(r => r.json());

  if (res.success) {
    showNotification('Scene uploaded');
    this.showGaussSceneDialog = false;
    // Add new scene to user list
    const newgaussScenes = {
      id: res.file.unique_filename,
      name: res.file.display_name,
      path: res.file.path,
      type: 'user' // Mark user-uploaded scene
    };
        
    this.VRMConfig.gaussUserScenes.push(newgaussScenes);
    // Select newly uploaded scene
    if (newgaussScenes) this.handleGaussSceneChange(newgaussScenes.id);
  } else {
    showNotification(res.message || 'Upload failed', 'error');
  }
},

/* Cancel upload */
cancelGaussSceneUpload() {
  this.showGaussSceneDialog = false;
  this.removeNewGaussScene();
},

/* Delete user scene */
async deleteGaussSceneOption(sceneId) {
  const scene = this.VRMConfig.gaussUserScenes.find(s => s.id === sceneId);
  if (!scene) return;

  // Extract UUID filename
  const filename = scene.path.split('/').pop();
  const res = await fetch(`/delete_gauss_scene/${filename}`, {
    method: 'DELETE'
  }).then(r => r.json());

  if (res.success) {
    showNotification('Scene deleted');
    // If deleted scene is active, switch to first default scene
    if (this.VRMConfig.selectedGaussSceneId === sceneId) {
      const firstDef = this.VRMConfig.gaussDefaultScenes[0];
      if (firstDef) this.handleGaussSceneChange(firstDef.id);
    }
    await this.loadGaussScenes();
  } else {
    showNotification(res.message || 'Deletion failed', 'error');
  }
},


  async confirmClearAll() {
    await this.clearAllHistoryRecords();
  },

  async keepLastWeek() {
    try {
      await this.$confirm(this.t('confirmKeepLastWeek'), this.t('warning'), {
        confirmButtonText: this.t('confirm'),
        cancelButtonText: this.t('cancel'),
        type: 'warning'
      });

      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      this.conversations = this.conversations.filter(conv => 
        conv.timestamp && conv.timestamp >= oneWeekAgo
      );
      if (this.conversations == []){
        this.conversationId = null; // Clear current conversation ID
      }
      
      await this.saveConversations();
    } catch (error) {
      // User cancelled operation
    }
  },
  changeGsvAudioPath() {
    if (this.newGsvAudio.path) {
      this.newGsvAudio.name = this.newGsvAudio.path;
    }
  },
    /* =============== Read-aloud workflow =============== */
toggleRead() {
  if (this.isReadRunning) {
    if (this.isReadPaused) {
      this.resumeRead();
    } else {
      this.pauseRead();
    }
  } else {
    this.startRead();
  }
},

// startRead implementation
async startRead() {
  if (!this.readConfig.longText.trim()) return;
  
  this.stopSegmentTTS();
  this.readState.currentChunk = 0;
  this.isReadStarting = true;
  this.isReadRunning  = true;
  this.isReadPaused   = false;  // Reset pause state
  this.isReadStopping = false;

  /* Clear previous playback state */
  this.readState.ttsChunks  = [];
  this.readState.audioChunks = [];
  this.readState.currentChunk = 0;
  this.readState.isPlaying = false;
  this.readState.chunks_voice = [];
  this.cur_voice = 'default';
  
  /* Reset audio counters */
  this.audioChunksCount = 0;
  this.totalChunksCount = 0;

  /* Segment text */
  const {
    chunks,
    chunks_voice,
    remaining,
    remaining_voice
  } = this.splitTTSBuffer(this.readConfig.longText);

  if (remaining) {
    chunks.push(remaining);
    chunks_voice.push(remaining_voice);
  }

  /* Strip tags and whitespace, synchronizing deletions */
  const cleanedChunks = chunks.map(txt => txt.replace(/<\/?[^>]+>/g, '').trim());
  const finalChunks = [];
  const finalChunksVoice = [];

  cleanedChunks.forEach((txt, idx) => {
    if (txt) {
      finalChunks.push(txt);
      finalChunksVoice.push(chunks_voice[idx]);
    }
  });

  if (!finalChunks.length) {
    this.isReadRunning  = false;
    this.isReadStarting = false;
    return;
  }

  this.readState.ttsChunks   = finalChunks;
  this.readState.chunks_voice = finalChunksVoice;
  this.totalChunksCount = finalChunks.length;

  /* Notify VRM that reading has started */
  this.sendTTSStatusToVRM('ttsStarted', {
    totalChunks: this.readState.ttsChunks.length
  });

  this.isReadStarting = false;

  /* Concurrent TTS */
  this.isAudioSynthesizing = true;
  await this.startReadTTSProcess();
},

// Pause reading
pauseRead() {
  if (!this.isReadRunning || this.isReadPaused) return;
  
  this.isReadPaused = true;
  
  // Pause current audio
  if (this.currentReadAudio) {
    this.currentReadAudio.pause();
  }
  
  // Notify VRM to pause
  this.sendTTSStatusToVRM('pauseSpeaking', {});
},

// Resume reading
resumeRead() {
  if (!this.isReadRunning || !this.isReadPaused) return;
  
  this.isReadPaused = false;
  
  // Resume current audio
  if (this.currentReadAudio) {
    this.currentReadAudio.play().catch(console.error);
  }
  
  // Notify VRM to resume
  this.sendTTSStatusToVRM('resumeSpeaking', {});
  
  // Try playing subsequent audio
  this.checkReadAudioPlayback();
},

    // processReadTTSChunk implementation
    async processReadTTSChunk(index) {
      try {
        const chunk = this.readState.ttsChunks[index];
        const voice = this.readState.chunks_voice[index];
        const cachedAudio = this.readState.audioChunks[index];

        // Check cached buffer rather than Base64
        if (cachedAudio?.url && cachedAudio?.buffer && cachedAudio?.text === chunk && cachedAudio?.voice === voice){
          // this.cur_audioDatas[index] = cachedAudio.buffer; // Optional; readState can be used directly
        }
        else{
          let chunk_text = chunk;
          let  chunk_expressions = [];
          if (chunk.indexOf('<') !== -1) {
              const tagReg = /<[^>]+>/g;
              chunk_expressions = (chunk.match(tagReg) || []).map(t => t.slice(1, -1));
              chunk_text = chunk.replace(tagReg, '').trim();
          }

          const res = await fetch('/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ttsSettings: this.ttsSettings, text: chunk_text, index, voice })
          });

          if (!res.ok) throw new Error('TTS failed');

          const blob = await res.blob();
          const url  = URL.createObjectURL(blob);

          // Use ArrayBuffer rather than Base64
          const audioBuffer = await blob.arrayBuffer();

          this.readState.audioChunks[index] = {
            url,                       
            expressions: chunk_expressions,
            buffer: audioBuffer, // Cache binary audio
            mimeType: blob.type, // Store actual MIME type
            text: chunk_text,
            index,
            voice
          };
        }

        this.audioChunksCount++;
        if (this.audioChunksCount >= this.totalChunksCount) {
          this.isAudioSynthesizing = false;
          this.audioChunksCount = this.totalChunksCount; 
        }

        this.checkReadAudioPlayback();
      } catch (e) {
        console.error(`Read TTS chunk ${index} error`, e);
        this.readState.audioChunks[index] = { url: null, expressions: [], text: "", index };
        this.audioChunksCount++;
        if (this.audioChunksCount >= this.totalChunksCount) {
          this.isAudioSynthesizing = false;
          this.audioChunksCount = this.totalChunksCount; 
        }
        this.checkReadAudioPlayback();
      }
    },

    async ClickToListen(SampleText,voice='default') {
      if (!SampleText) {
        SampleText ='Hello! This is a sample of my voice.'
      }

    try {
      // Copy settings to avoid directly changing this.ttsSettings
      let Settings = { ...this.ttsSettings };

      if (this.showAddTTSDialog) {
        Settings = { ...Settings, ...this.newTTSConfig };
      } else if (voice !== 'default' && this.ttsSettings.newtts && this.ttsSettings.newtts[voice]) {
        // Merge character settings when called from character voice card
        Settings = { ...Settings, ...this.ttsSettings.newtts[voice] };
      }

      // Include modelProviders for API key lookup
      // Backend looks up missing api_key from selectedProvider
      if (this.modelProviders && Array.isArray(this.modelProviders)) {
        Settings.modelProviders = this.modelProviders;
      }

        const res = await fetch('/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ttsSettings: Settings,
            text: SampleText,
            index: 0,          // Backend does not use this index
            voice: voice || 'default'
          })
        });
        if (!res.ok) throw new Error('TTS failed');

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        /* Play directly */
        const audio = new Audio(url);
        audio.play().catch(console.error);

        /* Clear memory after playback */
        audio.onended = () => URL.revokeObjectURL(url);
      } catch (e) {
        console.error('ClickToListen error', e);
      }
    },

    // Download method
    downloadAudio() {
      // Ensure audio chunks are available
      if (this.audioChunksCount === 0) {
        showNotification(this.t('noAudioToDownload'));
        return;
      }

      // Check for valid audio chunks
      const validChunks = this.readState.audioChunks.filter(chunk => chunk && chunk.url);
      if (validChunks.length === 0) {
        showNotification(this.t('noValidAudioChunks'));
        return;
      }

      try {
        // Combine valid audio chunks into a file
        this.createCombinedAudio(validChunks, this.getAudioMimeType());
      } catch (error) {
        console.error('Audio download failed:', error);
        showNotification(this.t('audioDownloadFailed'));
      }
    },



    // 1. downloadAudio delegates MIME detection to the helper
    downloadAudio() {
      if (this.audioChunksCount === 0) {
        showNotification(this.t('noAudioToDownload'));
        return;
      }

      // Filter invalid chunks
      const validChunks = this.readState.audioChunks.filter(chunk => chunk && chunk.url);
      if (validChunks.length === 0) {
        showNotification(this.t('noValidAudioChunks'));
        return;
      }

      try {
        // Call without arguments; detect format internally
        this.createCombinedAudio(validChunks);
      } catch (error) {
        console.error('Audio download failed:', error);
        showNotification(this.t('audioDownloadFailed'));
      }
    },

    // 2. createCombinedAudio detects the actual format
    async createCombinedAudio(chunks) {
      if (!chunks || chunks.length === 0) return;

      showNotification(this.t('audioProcessingStarted') || 'Processing audio...');

      try {
        // ================= Detect actual format =================
        // Fetch first chunk and inspect HTTP headers or Blob type
        const firstResponse = await fetch(chunks[0].url);
        const firstBlob = await firstResponse.blob();
        
        // Get MIME type without codec parameters
        const realMimeType = firstBlob.type.split(';')[0]; 
        
        console.log('Detected Real Audio Format:', realMimeType);

        // Infer extension and handling from actual MIME
        let extension = 'mp3'; // Default
        let isWav = false;

        if (realMimeType.includes('wav')) {
          extension = 'wav';
          isWav = true;
        } else if (realMimeType.includes('ogg')) {
          extension = 'ogg';
        } else if (realMimeType.includes('aac')) {
          extension = 'aac';
        } else if (realMimeType.includes('flac')) {
          extension = 'flac';
        } else if (realMimeType.includes('webm')) {
          extension = 'webm';
        } else if (realMimeType.includes('mp4') || realMimeType.includes('m4a')) {
          extension = 'm4a';
        }

        // ================= Fetch all chunks =================
        // Reuse first Blob to avoid a duplicate request
        const firstBuffer = await firstBlob.arrayBuffer();
        
        // Fetch remaining chunks concurrently
        const restPromises = chunks.slice(1).map(async (chunk) => {
          const response = await fetch(chunk.url);
          return response.arrayBuffer();
        });
        
        const restBuffers = await Promise.all(restPromises);
        const allBuffers = [firstBuffer, ...restBuffers];

        // ================= Combine based on format =================
        let combinedBuffer;

        if (isWav) {
          // For WAV, strip headers
          combinedBuffer = this.mergeWavBuffers(allBuffers);
        } else {
          // For MP3, OGG and other formats, concatenate
          // Chained Ogg may play only its first segment in browsers;
          // a local player can play the complete losslessly concatenated file.
          combinedBuffer = this.mergeGeneralBuffers(allBuffers);
        }

        // ================= Download file =================
        const blob = new Blob([combinedBuffer], { type: realMimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        
        a.href = url;
        // Use detected extension
        a.download = `tts-merged-${timestamp}.${extension}`; 
        
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
        
        showNotification(this.t('audioDownloadStarted'));

      } catch (error) {
        console.error('Audio merging failed:', error);
        showNotification(this.t('audioMergeFailed'));
      }
    },

    // --- Helpers ---
    
    // General concatenation (MP3/OGG/AAC)
    mergeGeneralBuffers(buffers) {
      const totalLength = buffers.reduce((acc, buffer) => acc + buffer.byteLength, 0);
      const result = new Uint8Array(totalLength);
      
      let offset = 0;
      buffers.forEach(buffer => {
        result.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
      });
      
      return result;
    },

    // WAV-specific concatenation
    mergeWavBuffers(buffers) {
      if (buffers.length === 0) return new Uint8Array(0);
      if (buffers.length === 1) return new Uint8Array(buffers[0]);

      const HEADER_SIZE = 44; 
      let totalDataLength = 0;
      
      buffers.forEach((buffer, index) => {
        if (index === 0) totalDataLength += buffer.byteLength;
        else totalDataLength += Math.max(0, buffer.byteLength - HEADER_SIZE);
      });

      const result = new Uint8Array(totalDataLength);
      
      // Write first file including header
      result.set(new Uint8Array(buffers[0]), 0);
      let offset = buffers[0].byteLength;

      // Append subsequent files without headers
      for (let i = 1; i < buffers.length; i++) {
        const buffer = new Uint8Array(buffers[i]);
        if (buffer.byteLength > HEADER_SIZE) {
            const dataChunk = buffer.subarray(HEADER_SIZE);
            result.set(dataChunk, offset);
            offset += dataChunk.byteLength;
        }
      }

      // Correct WAV header
      const view = new DataView(result.buffer);
      view.setUint32(4, result.byteLength - 8, true); 
      view.setUint32(40, result.byteLength - HEADER_SIZE, true);

      return result;
    },


// stopRead implementation
stopRead() {
  if (!this.isReadRunning) return;
  
  this.isReadStopping = true;
  this.isReadRunning  = false;
  this.isReadPaused   = false;  // Reset pause state
  this.readState.isPlaying = false;

  /* Stop current audio */
  if (this.currentReadAudio) {
    this.currentReadAudio.pause();
    this.currentReadAudio = null;
  }
  
  this.sendTTSStatusToVRM('stopSpeaking', {});
  
  /* Reset audio counters */
  this.isAudioSynthesizing = false;
  this.audioChunksCount = 0;
  this.totalChunksCount = 0;
  
  this.isReadStopping = false;
},

// stopTTSActivities implementation
stopTTSActivities() {
  // Stop read-aloud workflow
  if (this.isReadRunning) {
    this.isReadStopping = true;
    this.isReadRunning = false;
    this.isReadPaused = false;  // Reset pause state
    this.readState.isPlaying = false;
    
    /* Stop current audio */
    if (this.currentReadAudio) {
      this.currentReadAudio.pause();
      this.currentReadAudio = null;
    }
    this.sendTTSStatusToVRM('stopSpeaking', {});
    
    /* Reset audio counters */
    this.isAudioSynthesizing = false;
    
    this.isReadStopping = false;
  }
  
  // Stop audio conversion
  if (this.isConvertingAudio) {
    this.isConvertStopping = true;
    this.isConvertingAudio = false;
    this.isAudioSynthesizing = false;
    showNotification(this.t('audioConversionStopped'));
    this.isConvertStopping = false;
  }
},
  /* =============== Shared TTS workflow =============== */
  async startReadTTSProcess() {
    let max_concurrency = this.ttsSettings.maxConcurrency || 1;
    let nextIndex = 0;

    /* Use readState instead of the last chat message. */
    while (this.isReadRunning) {
      while (
        this.readState.ttsQueue.size < max_concurrency &&
        nextIndex < this.readState.ttsChunks.length
      ) {
        if (!this.isReadRunning) break;

        const index = nextIndex++;
        this.readState.ttsQueue.add(index);

        this.processReadTTSChunk(index).finally(() => {
          this.readState.ttsQueue.delete(index);
        });

        /* Prioritize first chunk */
        if (index === 0) await new Promise(r => setTimeout(r, 800));
      }
      await new Promise(r => setTimeout(r, 10));
    }
    console.log('Read TTS queue processing completed');
  },

  // convertAudioOnly implementation
  async convertAudioOnly() {
    if (!this.readConfig.longText.trim()) {
      showNotification(this.t('noTextToConvert'));
      return;
    }

    this.isConvertingAudio = true;
    
    try {
      // 1. Clear previous state
      this.readState.ttsChunks = [];
      this.readState.audioChunks = [];
      this.readState.chunks_voice = [];
      this.audioChunksCount = 0;
      this.totalChunksCount = 0;

  /* 2. Segment text */
      const {
        chunks,
        chunks_voice,
        remaining,
        remaining_voice
      } = this.splitTTSBuffer(this.readConfig.longText);

      // Append remaining text
      if (remaining) {
        chunks.push(remaining);
        chunks_voice.push(remaining_voice);
      }

      /* Strip tags and whitespace, keeping arrays aligned */
      // 1. Strip HTML tags
      const cleanedChunks = chunks.map(txt => txt.replace(/<\/?[^>]+>/g, '').trim());

      // 2. Remove empty text and corresponding chunks_voice entries
      const finalChunks       = [];
      const finalChunksVoice  = [];

      cleanedChunks.forEach((txt, idx) => {
        if (txt) {                      // Keep only nonempty text
          finalChunks.push(txt);
          finalChunksVoice.push(chunks_voice[idx]);
        }
      });

      // 3. Replace original arrays
      chunks.length       = 0;
      chunks_voice.length = 0;
      chunks.push(...finalChunks);
      chunks_voice.push(...finalChunksVoice);
      /* ================================================================ */
      
      if (!chunks.length) {
        this.isConvertingAudio = false;
        return;
      }
      
      this.readState.ttsChunks = chunks;
      this.readState.chunks_voice = chunks_voice;
      this.totalChunksCount = chunks.length;

      // 3. Convert using processReadTTSChunk without playback
      this.isAudioSynthesizing = true;
      
      // Use concurrency control for all segments
      const maxConcurrency = this.ttsSettings.maxConcurrency || 1;
      let nextIndex = 0;
      const activeTasks = new Set();
      
      // Wait for all tasks with a Promise
      await new Promise((resolve) => {
        const processNext = async () => {
          // Check for user cancellation
          if (!this.isConvertingAudio) {
            resolve();
            return;
          }
          
          // All tasks complete
          if (nextIndex >= chunks.length && activeTasks.size === 0) {
            resolve();
            return;
          }
          
          // Add tasks while slots and work remain
          while (activeTasks.size < maxConcurrency && nextIndex < chunks.length) {
            const index = nextIndex++;
            activeTasks.add(index);
            
            this.processTTSChunkWithoutPlayback(index)
              .finally(() => {
                activeTasks.delete(index);
                processNext(); // Check for another available task
              });
          }
        };
        
        processNext();
      });
      
      // Show completion only if not cancelled
      if (this.isConvertingAudio) {
        this.isAudioSynthesizing = false;
        showNotification(this.t('audioConversionCompleted', { count: chunks.length }));
      }
      
    } catch (error) {
      console.error('Audio conversion failed:', error);
      showNotification(this.t('audioConversionFailed'));
    } finally {
      this.isConvertingAudio = false;
    }
  },

    // Process TTS segment without playback
    async processTTSChunkWithoutPlayback(index) {
      const chunk = this.readState.ttsChunks[index];
      const voice = this.readState.chunks_voice[index];
      console.log(`Processing TTS chunk ${index}`);
      // Clean text
      let chunk_text = chunk;
      let chunk_expressions =[];
      if (chunk.indexOf('<') !== -1) {
        const tagReg = /<[^>]+>/g;
        chunk_expressions = (chunk.match(tagReg) || []).map(t => t.slice(1, -1)); // Strip surrounding angle brackets
        chunk_text = chunk.replace(tagReg, '').trim(); // Remove tags from body text
      }

      try {
        const res = await fetch('/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ttsSettings: this.ttsSettings,
            text: chunk_text,
            index,
            voice
          })
        });

        if (!res.ok) throw new Error('TTS failed');

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audioBuffer = await blob.arrayBuffer();
        /* Base64 for VRM */
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload  = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        this.cur_audioDatas[index] = `data:${blob.type};base64,${base64}`;
        /* Cache playback data */
        this.readState.audioChunks[index] = {
          url,                       // Local playback URL
          expressions: chunk_expressions,
          buffer: audioBuffer, 
          mimeType: blob.type, 
          text: chunk_text,
          index,
          voice
        };
        // Increment counter
        this.audioChunksCount++;
        if (this.audioChunksCount >= this.totalChunksCount) {
          this.isAudioSynthesizing = false;
          this.audioChunksCount = this.totalChunksCount; // Reset counter
        }
      } catch (e) {
        console.error(`TTS chunk ${index} error`, e);
        this.readState.audioChunks[index] = { 
          url: null, 
          expressions: chunk_expressions, 
          text: chunk_text, 
          index 
        };
        
        // Increment count on error as well
        this.audioChunksCount++;
        if (this.audioChunksCount >= this.totalChunksCount) {
          this.isAudioSynthesizing = false;
          this.audioChunksCount = this.totalChunksCount; // Reset counter
        }
      }
    },

  /* =============== Playback monitoring =============== */
  async startReadAudioPlayProcess() {
    /* Same as chat playback, using readState. */
    this.readState.currentChunk = 0;
    this.readState.isPlaying   = false;
    this.audioPlayQueue = [];
  },

  async checkReadAudioPlayback() {
    if (this.isReadPaused) return;
    if (!this.isReadRunning || this.readState.isPlaying) return;

    const curIdx = this.readState.currentChunk;
    const total  = this.readState.ttsChunks.length;
    if (curIdx >= total) {
      console.log('All read audio chunks played');
      this.readState.currentChunk = 0;
      this.isReadRunning = false;
      this.cur_audioDatas = [];
      this.sendTTSStatusToVRM('allChunksCompleted', {});
      return;
    }

    const audioChunk = this.readState.audioChunks[curIdx];
    if (!audioChunk) return;

    this.readState.isPlaying = true;
    console.log(`Playing read audio chunk ${curIdx}`);
    this.scrollToCurrentChunk(curIdx);
    
    try {
      // Send binary audio to VRM using the chat playback mechanism
      if ((this.vrmOnline || this.vtsOnline) && audioChunk.buffer) {
          const metadata = {
              type: 'audio_chunk',
              chunkIndex: curIdx,
              text: audioChunk.text,
              expressions: audioChunk.expressions,
              mimeType: audioChunk.mimeType || 'audio/wav'
          };
          this.sendBinaryToVRM(metadata, audioChunk.buffer);
      }

      this.currentReadAudio = new Audio(audioChunk.url);
      this.currentReadAudio.volume = this.vrmOnline ? 0.0000001 : 1; // Mute local playback while VRM is online

      // Send state commands without audioDataUrl
      this.sendTTSStatusToVRM('startSpeaking', {
        chunkIndex: curIdx,
        totalChunks: total,
        text: audioChunk.text,
        expressions: audioChunk.expressions,
        voice: this.readState.chunks_voice[curIdx]
      });

      await new Promise(resolve => {
        this.currentReadAudio.onended = () => {
          this.sendTTSStatusToVRM('chunkEnded', { chunkIndex: curIdx });
          resolve();
        };
        this.currentReadAudio.onerror = resolve;
        this.currentReadAudio.play().catch(console.error);
      });
    } catch (e) {
      console.error('Read playback error', e);
    } finally {
      this.readState.currentChunk++;
      this.readState.isPlaying = false;
      setTimeout(() => this.checkReadAudioPlayback(), 0);
    }
  },
    async parseSelectedFile() {
        this.readConfig.longText = '';
        this.readConfig.longTextList = [];
        this.longTextListIndex = 0;
        // Look up file metadata by unique_filename in textFiles
        const selectedFile = this.textFiles.find(file => file.unique_filename === this.selectedFile);
        try {
          if (selectedFile) {
            // Construct complete request URL
            const url = `/get_file_content?file_url=${selectedFile.unique_filename}`;
            
            // Request file contents
            const response = await fetch(url, {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (selectedFile.unique_filename.toLowerCase().endsWith('.epub')){
              // Convert data.content to dictionary
              let data_json = JSON.parse(data.content);
              this.readConfig.longTextList = data_json.chapters || [];
              if (this.readConfig.longTextList.length > 0){
                this.longTextListIndex = 0;
                this.readConfig.longText = this.readConfig.longTextList[0];
              }else{
                this.readConfig.longText = data.content;
              }
            }else{
              this.readConfig.longText = data.content;
            }
            // Limit readConfig.longText to its first 100000 characters
            // if (this.readConfig.longText.length > 100000) {
            //   this.readConfig.longText = this.readConfig.longText.substring(0, 100000);
            //   showNotification(this.t('contentTooLong'))
            // }
          }
        }
        catch (error) {
          console.error('Error:', error);
        }
    },
  NextPage() {
    if (this.longTextListIndex < this.readConfig.longTextList.length - 1) {
      this.longTextListIndex++;
      this.readConfig.longText = this.readConfig.longTextList[this.longTextListIndex];
    }
  },
  PrevPage() {
    if (this.longTextListIndex > 0) {
      this.longTextListIndex--;
      this.readConfig.longText = this.readConfig.longTextList[this.longTextListIndex];
    }
  },
  openAddTTSDialog() {
    this.newTTSConfig = {
      name: '',
      enabled: true,
      SampleText: 'Hello! This is a voice test.',
      engine: 'moss',
      edgettsLanguage: 'en-US',
      edgettsGender: 'Female',
      edgettsVoice: 'JennyNeural',
      edgettsRate: 1.0,
      gsvServer: "http://127.0.0.1:9880",
      gsvTextLang: 'en',
      gsvRate: 1.0,
      gsvPromptLang: 'en',
      gsvPromptText: '',
      gsvRefAudioPath: '',
      gsvAudioOptions: [],
      selectedProvider: null,
      vendor: "OpenAI",
      model: "",
      base_url: "",
      api_key: "",
      openaiVoice:"alloy",
      openaiSpeed: 1.0,
      customTTSserver: "http://127.0.0.1:9880",
      customTTSspeaker: "",
      customTTSspeed: 1.0,
      mossVoice: 'Ava',
      mossSpeed: 1.0,
    };
    this.showAddTTSDialog = true;
  },

  saveNewTTSConfig() {
    const name = this.newTTSConfig.name;
    if (!name) return;

    this.ttsSettings.newtts[name] = { ...this.newTTSConfig };
    this.showAddTTSDialog = false;
    this.autoSaveSettings();
  },

  deleteTTS(name) {
    delete this.ttsSettings.newtts[name];
  },

  editTTS(name) {
    this.newTTSConfig = { ...this.ttsSettings.newtts[name] };
    this.showAddTTSDialog = true;
  },

  openAddAppearanceDialog() {
    this.newAppearanceConfig = {
      name: '',
      windowWidth: 540,
      windowHeight: 960,
      selectedModelId: 'alice', // Default to Alice model
      selectedMotionIds: [],
    };
    this.showAddAppearanceDialog = true;
  },
  editAppearance(name) {
    this.newAppearanceConfig = { ...this.VRMConfig.newVRM[name] };
    this.showAddAppearanceDialog = true;
  },
  deleteAppearance(name) {
    delete this.VRMConfig.newVRM[name];
  },
  saveNewAppearanceConfig() {
    const name = this.newAppearanceConfig.name;
    if (!name) return;

    this.VRMConfig.newVRM[name] = { ...this.newAppearanceConfig };
    this.showAddAppearanceDialog = false;
    this.autoSaveSettings();
  },
  addBehavior() {
    // Deep-copy default template
    this.behaviorSettings.behaviorList.push(JSON.parse(JSON.stringify(this.newBehavior)));
    this.autoSaveSettings();
  },
  removeBehavior(idx) {
    this.behaviorSettings.behaviorList[idx].enabled = false;
    this.behaviorSettings.behaviorList.splice(idx, 1);
    showNotification(this.t('deleteBehaviorSuccess'))
    this.autoSaveSettings();
  },
  resetBehavior(idx) {
    this.behaviorSettings.behaviorList[idx] = JSON.parse(JSON.stringify(this.newBehavior));
    this.autoSaveSettings();
  },
  removeAllBehavior() {
    this.behaviorSettings.behaviorList.forEach((b) => {
      b.enabled = false;
    });
    this.behaviorSettings.behaviorList = [];
    showNotification(this.t('deleteAllBehaviorSuccess'))
    this.autoSaveSettings();
  },
    /* Execute behavior */
    runBehavior(b) {
      if (!b.enabled) return
      if (!this.noInputFlag){
        this.stopGenerate()
      }
      if (b.action.type === 'prompt' && b.action.prompt) {
        console.log('Prompt:', b.action.prompt)
        this.userInput= '[system]:'+ b.action.prompt
        // Send prompt to the model
        this.sendMessage();
      }
      if (b.action.type === 'random' && b.action.random) {
        if(b.action.random.events.length > 0){
          if (b.action.random.type === 'random'){
            let randomEvent = b.action.random.events[Math.floor(Math.random() * b.action.random.events.length)];
            if(randomEvent){
              this.userInput= '[system]:'+randomEvent;
              // Send prompt to the model
              this.sendMessage();
            }
          }else if( b.action.random.type === 'order'){
            if(b.action.random.orderIndex >= b.action.random.events.length){
              b.action.random.orderIndex = 0;
            }
            if(b.action.random.events[b.action.random.orderIndex]){
              let randomEvent = b.action.random.events[b.action.random.orderIndex];
              b.action.random.orderIndex += 1;
              if(randomEvent){
                this.userInput= '[system]:'+randomEvent;
                // Send prompt to the model
                this.sendMessage();
              }
            }
          }
        }
      }
    },

    /* Disable a nonrepeating behavior after execution */
    disableOnceBehavior(b) {
      if (b.trigger.type === 'time' && !b.trigger.time.days.length && b.platform === 'chat') {
        b.enabled = false
        this.autoSaveSettings()
      }
    },
    handleAllBriefly(){
      this.allBriefly = !this.allBriefly;
      if(this.allBriefly){
        this.messages.forEach((m) => {
          m.briefly = true;
        })
      }else{
        this.messages.forEach((m) => {
          m.briefly = false;
        })
      }
    },
    async handleDownload(file) {
      // Construct complete file URL
      const fileUrl = `${this.partyURL}/uploaded_files/${file.unique_filename}`;
      console.log(fileUrl);
      if (isElectron) {
        try {
          await window.electronAPI.downloadFile({
            url: fileUrl,
            filename: file.original_filename || file.unique_filename
          });
        } catch (e) {
          console.error(e);
        }
      } else {
        // Retain non-Electron handling
        const link = document.createElement('a');
        link.href = fileUrl;
        link.download = file.unique_filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    },
  removeEvent(idx,index) {
    this.behaviorSettings.behaviorList[idx].action.random.events.splice(index, 1);
    this.autoSaveSettings(); // Autosave after deletion
  },
  addNewEvent(idx) {
    this.behaviorSettings.behaviorList[idx].action.random.events.push(''); // Append an empty event to display a new input field
    this.autoSaveSettings();
  },

  // Initialize periodic timer
initCycleTimer(behavior, index) {
  if (this.cycleTimers[index]) {
    clearInterval(this.cycleTimers[index]);
  }
  const [hours, minutes, seconds] = behavior.trigger.cycle.cycleValue.split(':').map(Number);
  const cycleMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
  let currentCount = 0;
  
  this.cycleTimers[index] = setInterval(() => {
    // Recheck enabled state and platform before execution
    if (!behavior || !behavior.enabled || !this.isTargetPlatform(behavior, 'chat')) return;
    
    if (behavior.trigger.cycle.isInfiniteLoop || currentCount < behavior.trigger.cycle.repeatNumber) {
      this.runBehavior(behavior);
      currentCount++;
      if (!behavior.trigger.cycle.isInfiniteLoop && currentCount >= behavior.trigger.cycle.repeatNumber) {
        clearInterval(this.cycleTimers[index]);
        this.cycleTimers[index] = null;
        behavior.enabled = false;
      }
    }
  }, cycleMs);
},

// --- Reset timers ---
resetCycleTimers() {
  // Skip if settings or behavior list is not loaded
  if (!this.behaviorSettings || !Array.isArray(this.behaviorSettings.behaviorList)) {
    return;
  }

  // Ensure cycleTimers is an array
  if (!Array.isArray(this.cycleTimers)) {
    this.cycleTimers = [];
  }

  // Clear old timers
  this.cycleTimers.forEach((timer, index) => {
    if (timer) clearInterval(timer);
    this.cycleTimers[index] = null;
  });

  // Reinitialize
  this.behaviorSettings.behaviorList.forEach((b, index) => {
    // Check b and b.trigger
    if (b && b.enabled && b.trigger && b.trigger.type === 'cycle' && this.isTargetPlatform(b, 'chat')) {
      this.initCycleTimer(b, index);
    }
  });
},


isTargetPlatform(behavior, platformKey) {
  // 1. Missing behavior
  if (!behavior) return false;

  // 2. Check new platforms array
  // Ensure array is nonempty before reading index zero
  if (behavior.platforms && Array.isArray(behavior.platforms) && behavior.platforms.length > 0) {
    if (behavior.platforms.includes('all')) return true;
    return behavior.platforms.includes(platformKey);
  }

  // 3. Support legacy platform string
  if (behavior.platform && typeof behavior.platform === 'string') {
    return behavior.platform === 'all' || behavior.platform === platformKey;
  }

  // 4. Fallback
  return platformKey === 'chat';
},

    startDriverGuide() {
      const KEY = 'driver_guide_shown';
      if (localStorage.getItem(KEY)) return;
      localStorage.setItem(KEY, '1');

      const driver = window.driver.js.driver;

      const d = driver({
        allowClose: true,
        disableActiveInteraction: false,
        showProgress: true,
        nextBtnText: this.t('next'),
        prevBtnText: this.t('prev'),
        doneBtnText: this.t('done'),
        steps: [
          {
            element: '#driver-guide-btn',
            popover: {
              title: this.t('guide.driver-guide-btn'),
              description: this.t('guide.driver-guide-btn-notice'),
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#model-config',
            popover: {
              title: this.t('guide.model-config'),
              description: this.t('guide.model-config-notice'),
              side: 'right',
              // Use onNextClick instead of onNext
              onNextClick: async () => {
                await this.handleSelect('model-config');
                // Manually advance tour
                d.moveNext();
              }
            },
          },
          {
            element: '#add-provider-card',
            popover: {
              title: this.t('guide.add-provider-card'),
              description: this.t('guide.add-provider-card-notice'),
              side: 'right',
              // Use onNextClick instead of onNext
              onNextClick: () => {
                this.showAddDialog = true;
                setTimeout(() => d.moveNext(), 100); // Manually advance tour
              }
            }
          },
          {
            element: '#show-Add-Dialog',
            popover: {
              title: this.t('guide.show-Add-Dialog'),
              description: this.t('guide.show-Add-Dialog-notice'),
              side: 'top',
              // Handle onNextClick
              onNextClick: async () => {
                // 1. Check whether a provider is selected
                if (!this.newProviderTemp.vendor) {
                  // 2. Ensure provider list has at least three entries
                  if (this.vendorOptions && this.vendorOptions.length >= 3) {
                    // Select third provider at zero-based index two
                    const thirdVendorValue = this.vendorOptions[2].value;
                    
                    // Call selection method or assign directly
                    // this.newProviderTemp.vendor = thirdVendorValue; 
                    this.handleSelectVendor(thirdVendorValue);
                    
                    // 3. Wait for Vue DOM update before highlighting confirmation,
                    // so the button is enabled.
                    await this.$nextTick(); 
                  }
                }
                
                // 4. Advance manually
                d.moveNext();
              }
            }
          },
          {
            element: '#confirm-Add-Provider-Button',
            popover: {
              title: this.t('guide.confirm-Add-Provider-Button'),
              side: 'right',
              // Use onNextClick instead of onNext
              onNextClick: async () => {
                this.confirmAddProvider();
                // Manually advance tour
                d.moveNext();
              }
            }
          },
          {
            element: '#get-API-key',
            popover: {
              title: this.t('guide.get-API-key'),
              description: this.t('guide.get-API-key-notice'),
              side: 'right',
              onPrevClick: () => {
                this.showAddDialog = true;
                setTimeout(() => d.moveNext(), 100); // Manually advance tour
              },
            }
          },
          {
            element: '#input-api-Key',
            popover: {
              title: this.t('guide.input-api-Key'),
              description: this.t('guide.input-api-Key-notice'),
              side: 'right',
            }
          },
          {
            element: '#get-Models-List',
            popover: {
              title: this.t('guide.get-Models-List'),
              description: this.t('guide.get-Models-List-notice'),
              side: 'right',
            }
          },
          {
            element: '#model-Id',
            popover: {
              title: this.t('guide.model-Id'),
              description: this.t('guide.model-Id-notice'),
              side: 'right',
            }
          },
        ]
      });

      // Listen for clicks on highlighted element
      const checkClick = (e) => {
        if (e.target.closest('#model-config')) {
          d.moveNext();
        }
        if (e.target.closest('#add-provider-card')) {
          d.moveNext();
        }
        if (e.target.closest('#confirm-Add-Provider-Button')) {
          d.moveNext();
        }
        if (e.target.closest('#get-API-key')) {
          d.moveNext();
        }
        if (e.target.closest('#get-Models-List')) {
          d.moveNext();
        }
        if (e.target.closest('#vendor-Option')) {
          setTimeout(() => d.moveNext(), 100); // Manually advance tour
        }
      };
      document.addEventListener('click', checkClick);

      // Remove listener
      d.onDestroyed = () => document.removeEventListener('click', checkClick);

      setTimeout(() => d.drive(), 300);
    },


  // Manually restart the tour
  restartDriverGuide() {
    localStorage.removeItem('driver_guide_shown');
    this.startDriverGuide();
  },
  showToolInfo(tool) {
    this.toolForShowInfo = tool;
    this.showToolInfoDialog = true;
  },
  toggleAssistantMode() {
    if (this.activeMenu != 'home' && this.activeMenu != 'dashboard'){
      this.activeMenu = 'home';
    }

    this.isPttMode = false;
    console.log('Toggle assistant mode; current state:', this.isAssistantMode);

    if (this.isAssistantMode && !this.isMac) {
      // Exit assistant mode and maximize
      console.log('Exiting assistant mode; maximizing window');
      window.electronAPI.windowAction('maximize'); // Restore default size
    } else {
      // Enter assistant mode at compact size
      console.log('Entering assistant mode; window size:', 340, 800);
      window.electronAPI.toggleWindowSize(340, 800);
    }

    this.sidePanelOpen = false;
    this.isAssistantMode = !this.isAssistantMode;
    console.log('Mode changed; new state:', this.isAssistantMode);
  },
    fixedWindow() {
    // Invert state
    const next = !this.isFixedWindow;
    // Tell main process to set always-on-top
    window.electronAPI.setAlwaysOnTop(next);
    // Synchronize local state
    this.isFixedWindow = next;
  },
  handleScreenshotCommand(command) {
    if (command === 'hide') {
      // Capture with main window hidden
      this.toggleScreenshot(true);
    } else if (command === 'no-hide') {
      // Capture current window
      this.toggleScreenshot(false);
    }
  },

  // hideMainWindow determines whether to hide the main window during capture
  async toggleScreenshot(hideMainWindow = true) {
    try {
      // 1. Open selection overlay
      const rect = await window.electronAPI.showScreenshotOverlay(hideMainWindow)
      
      if (!rect) return // User cancelled

      // 2. Crop
      const buf = await window.electronAPI.cropDesktop({ rect })

      // 3. Create Blob and File
      const blob = new Blob([buf], { type: 'image/png' })
      const file = new File([blob], `desktop_${Date.now()}.png`, { type: 'image/png' })

      // 4. Create local preview URL and append to images
      const localUrl = URL.createObjectURL(blob)
      
      // Append to images; allItems includes the computed image list
      this.images.push({ 
        file, 
        name: file.name, 
        path: localUrl,  // Use blob URL rather than empty string
        type: 'image'    // Mark as image for allItems
      })

      // Synchronize allItems if it is a separate array
      // this.allItems.push({
      //   name: file.name,
      //   path: localUrl,
      //   type: 'image',
      //   file: file
      // })

    } catch (e) {
      console.error('Screenshot failed:', e)
    } finally {
      // 5. Clean up and restore window
      await window.electronAPI.cancelScreenshotOverlay();
      window.electronAPI.windowAction('show');
    }
  },
  async toggleDynamicIsland() {
    if (!this.isDynamicIsland) {
      if (isElectron && window.electronAPI.openIslandWindow) {
        window.electronAPI.openIslandWindow();
        this.isDynamicIsland = true;
        if (window.electronAPI.onIslandWindowClosed) {
          window.electronAPI.onIslandWindowClosed(() => {
            this.isDynamicIsland = false;
          });
        }
      }
    } else {
      if (isElectron && window.electronAPI.closeIslandWindow) {
        window.electronAPI.closeIslandWindow();
      }
      this.isDynamicIsland = false;
    }
    this.sidePanelOpen = false;
  },
  toggleMinimalMode() {
    if (!this.isMinimalMode) {
      // Enter compact mode in separate window
      window.electronAPI.openMinimalWindow();
      this.isMinimalMode = true;

      // Synchronize state when compact window closes
      if (window.electronAPI.onMinimalWindowClosed) {
        window.electronAPI.onMinimalWindowClosed(() => {
          this.isMinimalMode = false;
        });
      }
    } else {
      // Exit compact mode and close window
      window.electronAPI.closeMinimalWindow();
      this.isMinimalMode = false;
    }
    this.sidePanelOpen = false;
  },
  addPrompt() {
    this.promptForm = { id: null, name: '', content: '' };
    this.showPromptDialog = true;
  },
  editPrompt(row) {
    this.promptForm = { ...row };
    this.showPromptDialog = true;
  },
  savePrompt() {
    if (!this.promptForm.name || !this.promptForm.content) {
      showNotification(this.t('pleaseCompleteForm'), 'warning')
      return
    }
    if (!this.promptForm.id) {
      // Add entry
      this.SystemPromptsList.push({
        id: Date.now(),
        name: this.promptForm.name,
        content: this.promptForm.content
      })
    } else {
      // Edit by replacing indexed entry
      const idx = this.SystemPromptsList.findIndex(p => p.id === this.promptForm.id)
      if (idx > -1) {
        // Vue 3 supports direct assignment
        this.SystemPromptsList[idx] = { ...this.promptForm }
      }
    }
    this.showPromptDialog = false
    this.autoSaveSettings()
  },

  removePrompt(id) {
    const idx = this.SystemPromptsList.findIndex(p => p.id === id);
    if (idx > -1) this.SystemPromptsList.splice(idx, 1);
    this.autoSaveSettings();
  },
  /* Use button handler */
  usePrompt(content) {
    this.messages[0].content = content;
    this.activeMenu = 'home';      // Switch to home view
    this.showEditDialog = false;
  },
  /* Main entry point */
  async handleTranslate() {
    if (!this.sourceText.trim() || this.isTranslating) return;
    this.isTranslating = true;
    this.translatedText = this.t('translating') + '…';

    const controller = new AbortController();
    this.translateAbortController = controller;

    // Build TTS prompt consistent with translateMessage
    let newttsList = [];
    if (this.ttsSettings?.newtts) {
      for (const key in this.ttsSettings.newtts) {
        if (this.ttsSettings.newtts[key].enabled) newttsList.push(key);
      }
    }
    const ttsPrompt = 'If the text is already in the target language, return it unchanged.'

    try {
      const res = await fetch('/simple_chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.mainAgent,
          messages: [
            {
              role: 'system',
              content: `You are a professional translator. Translate the user's content strictly into ${this.target_lang}, preserving formatting such as Markdown and line breaks. Add no extra content. Return only the translation.${ttsPrompt}`
            },
            {
              role: 'user',
              content: `Translate the following content into ${this.target_lang}:\n\n${this.sourceText}`
            }
          ],
          stream: true,
          temperature: 0.1
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        let errMsg = 'Network error';
        try {
          const errData = await res.json();
          errMsg = errData?.error?.message || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = ''; // Residual partial line
      let result = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep the potentially incomplete last line for the next iteration

        for (const line of lines) {
          if (!line) continue; // Skip blank lines
          try {
            const chunk = JSON.parse(line);
            const delta = chunk.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              result += delta;
              this.translatedText = result; // Render incrementally
            }
          } catch {
            // Ignore parse failures
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        this.translatedText = `Translation error: ${e.message}`;
      }
    } finally {
      this.isTranslating = false;
      this.translateAbortController = null;
    }
  },

  abortTranslate () {
    this.translateAbortController?.abort()
    this.isTranslating = false
  },

  clearAll () {
    this.sourceText = ''
    this.translatedText = ''
  },
  changeLanguage() {
    this.target_lang = this.targetLangSelected!="system"? this.targetLangSelected: navigator.language || navigator.userLanguage || 'en-US';
    this.autoSaveSettings()
  },
  copyTranslated() {
    if (!this.translatedText) return
    navigator.clipboard.writeText(this.translatedText)
    showNotification(this.t('copy_success'))
  },
  handleShowAddMemoryDialog() {
    if (this.isGenerating){
      showNotification(this.t('AIgening'))
       return;
    }
    this.showAddMemoryDialog = true
  },
  async handleQuickGen() {
    if (!this.quickCreatePrompt.trim() || this.isGenerating) return;

    this.isGenerating = true;
    showNotification(this.t('startGen'));

    const controller = new AbortController();
    this.QuickGenAbortController = controller;

    const systemPrompt = `You are a professional character designer.
  Generate the card in the same language as the user's input.
  The user provides a brief idea. Respond only with valid JSON inside a standard Markdown code block.
  Use double quotes for JSON strings, and single quotes for quotations within values.
  Include 5-10 dialogue exchanges in mesExample, 5-10 alternateGreetings and at least 10 characterBook keyword entries.
  The JSON structure must be:

    {
      "name": "Character name",
      "description": "Detailed background and world setting",
      "personality": "Personality traits",
      "mesExample": "Show 5-10 dialogue exchanges using spoken dialogue only, without inner thoughts or action descriptions. Format: User: xxx\\nCharacter: xxx",
      "systemPrompt": "System instructions for the character",
      "firstMes": "First greeting, spoken dialogue only, without thoughts or action descriptions",
      "alternateGreetings": ["Alternative greeting 2","Alternative greeting 3"],
      "characterBook": [
          {"keysRaw":"keyword1\\nkeyword2","content":"Information to provide to the AI when the user mentions keyword1 or keyword2."},
          {"keysRaw":"keyword3","content":"Information to provide to the AI when the user mentions keyword3."}
      ]
    }

  Supply every field. Make characterBook rich, preferably with at least 10 concise entries, and include at least five alternate greetings.
  Do not include an avatar field.`;

    try {
      const res = await fetch('/simple_chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: this.quickCreatePrompt }
          ],
          stream: true,   // Enable streaming
          temperature: 0.8
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        let errMsg = 'Network error';
        try { const errData = await res.json(); errMsg = errData?.error?.message || errMsg; } catch (_) {}
        throw new Error(errMsg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';      // Residual partial line
      let fullText = '';    // Accumulate full reply

      // 1. Read stream incrementally
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep potentially incomplete last line

        for (const line of lines) {
          if (!line) continue;
          try {
            const chunk = JSON.parse(line);
            const delta = chunk.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              fullText += delta;
              this.quickCreatePrompt = fullText; // Display live
            }
          } catch {
            // Ignore parse failures
          }
        }
      }

      // 2. Parse after stream ends
      let raw = fullText.trim();

      // Remove code fence
      const codeBlock = raw.match(/^```json\s*([\s\S]*?)```$/);
      if (codeBlock) raw = codeBlock[1];
      const tildeBlock = raw.match(/^```\s*([\s\S]*?)```$/);
      if (tildeBlock) raw = tildeBlock[1];

      // Parse JSON
      let json;
      try {
        json = JSON.parse(raw);
      } catch (e) {
        throw new Error('The AI returned invalid JSON: ' + e.message);
      }

      // 3. Write newMemory and save
      Object.assign(this.newMemory, {
        name: json.name ?? '',
        infer:false,
        providerId: null,
        model: '',
        base_url: '',
        api_key: '',
        vendor: '',
        description: json.description ?? '',
        personality: json.personality ?? '',
        mesExample: json.mesExample ?? '',
        systemPrompt: json.systemPrompt ?? '',
        firstMes: json.firstMes ?? '',
        alternateGreetings: json.alternateGreetings?.filter(Boolean) ?? [],
        characterBook: (json.characterBook ?? []).map(b => ({
          keysRaw: b.keysRaw ?? '',
          content: b.content ?? ''
        })),
        avatar: ''
      });
      this.newMemory.id = null;
      this.addMemory();
      showNotification(this.t('genSuccess'));

    } catch (e) {
      if (e.name === 'AbortError') {
        console.log('QuickGen aborted');
      } else {
        showNotification(this.t('genFailed') + ': ' + e.message, 'error');
      }
    } finally {
      this.isGenerating = false;
      this.QuickGenAbortController = null;
      this.quickCreatePrompt = '';
    }
  },
  stopQuickGen() {
    this.QuickGenAbortController?.abort()
    this.isGenerating = false
  },
  async handleSystemPromptQuickGen() {
    if (!this.quickCreateSystemPrompt.trim() || this.isSystemPromptGenerating) return;
    
    this.isSystemPromptGenerating = true;
    this.promptForm.name = this.quickCreateSystemPrompt;
    showNotification(this.t('startGen'));
    
    const controller = new AbortController();
    this.QuickGenSystemPromptAbortController = controller;
    
    try {
      const res = await fetch('/simple_chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.mainAgent,
          messages: [
            {
              role: 'system',
              content: `Expand the user's brief system prompt into detailed instructions that help a language model perform its task more effectively.
  Generate the optimized system prompt in the same language as the user's input.
  Consider the character name, role, core capabilities, response style, constraints and output examples, among other relevant details`,
            },
            {
              role: 'user',
              content: `${this.quickCreateSystemPrompt}`,
            },
          ],
          stream: true,
          temperature: 0.8
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errMsg = 'Network error';
        try { const errData = await res.json(); errMsg = errData?.error?.message || errMsg; } catch (_) {}
        throw new Error(errMsg);
      }
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let result = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          try {
            const data = JSON.parse(line);
            
            // Handle streaming response format
            if (data.choices && data.choices[0]) {
              const choice = data.choices[0];
              
              // Handle streamed increments
              if (choice.delta && choice.delta.content) {
                result += choice.delta.content;
                this.quickCreateSystemPrompt = result;
              }
              // Or handle final stop response
              else if (choice.finish_reason === 'stop') {
                // Finished; no additional processing needed
              }
            }
          } catch (e) {
            console.warn('Failed to parse SSE line:', line, e);
          }
        }
        
        buffer = lines[lines.length - 1];
      }
      
      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
            result += data.choices[0].delta.content;
            this.quickCreateSystemPrompt = result;
          }
        } catch (e) {
          console.warn('Failed to parse remaining buffer:', buffer, e);
        }
      }
      
      // Save generated prompt
      this.promptForm.content = this.quickCreateSystemPrompt;
      this.promptForm.id = null;
      await this.savePrompt();
      
      showNotification(this.t('genSuccess'));
      this.quickCreateSystemPrompt = '';
      
    } catch (e) {
      if (e.name === 'AbortError') {
        // Do not show an error for user cancellation
        console.log('System prompt generation was aborted');
      } else {
        console.error('System prompt generation failed:', e);
        showNotification(this.t('genFailed') + ': ' + e.message, 'error');
      }
    } finally {
      this.isSystemPromptGenerating = false;
      this.QuickGenSystemPromptAbortController = null;
    }
  },
  stopSystemPromptQuickGen() {
    this.QuickGenSystemPromptAbortController?.abort()
    this.isSystemPromptGenerating = false
  },
  async toggleQuickGen(index) {
    let systemPrompt = this.messages[index].content;
    if (!systemPrompt.trim()) {
      showNotification(this.t('noSystemPromptToExtend'), 'error');
      return;
    }
    
    showNotification(this.t('startGen'));
    this.isQuickGenerating = true;
    const abortController = new AbortController();
    this.abortController = abortController;
    
    try {
      const res = await fetch('/simple_chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.mainAgent,
          messages: [
            {
              role: 'system',
              content: `Expand the user's brief system prompt into detailed instructions that help a language model perform its task more effectively.
  Generate the optimized system prompt in the same language as the user's input.
  Consider the character name, role, core capabilities, response style, constraints and output examples, among other relevant details`
            },
            {
              role: 'user',
              content: `${systemPrompt}`,
            },
          ],
          stream: true,
          temperature: 0.8
        }),
        signal: this.abortController.signal,
      });

      if (!res.ok) {
        let errMsg = 'Network error';
        try { const errData = await res.json(); errMsg = errData?.error?.message || errMsg; } catch (_) {}
        throw new Error(errMsg);
      }
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let result = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          try {
            const data = JSON.parse(line);
            
            // Handle streaming response format
            if (data.choices && data.choices[0]) {
              const choice = data.choices[0];
              
              // Handle streamed increments
              if (choice.delta && choice.delta.content) {
                result += choice.delta.content;
                this.messages[index].content = result;
                this.requestScrollToBottom();
              }
              // Or handle final stop response
              else if (choice.finish_reason === 'stop') {
                // Finished; no additional processing needed
              }
            }
          } catch (e) {
            console.warn('Failed to parse SSE line:', line, e);
          }
        }
        
        buffer = lines[lines.length - 1];
      }
      
      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
            result += data.choices[0].delta.content;
            this.messages[index].content = result;
            this.requestScrollToBottom();
          }
        } catch (e) {
          console.warn('Failed to parse remaining buffer:', buffer, e);
        }
      }
      
      showNotification(this.t('genSuccess'));
      
    } catch (e) {
      if (e.name === 'AbortError') {
        // Do not show an error for user cancellation
        console.log('Quick generation was aborted');
      } else {
        console.error('Quick generation failed:', e);
        showNotification(this.t('genFailed') + ': ' + e.message, 'error');
      }
    } finally {
      this.isQuickGenerating = false;
      this.abortController = null;
    }
  },
  saveSystemPrompt(index) {
    let systemPrompt = this.messages[index].content;
    this.activeMenu = 'role';
    this.subMenu = 'memory';
    this.activeMemoryTab = 'prompts';
    this.promptForm = { id: null, name: '', content: systemPrompt };
    this.showPromptDialog = true;
  },
  async browseDirectory() {
    if (!this.isElectron) {
      // Browser environment
      return;
    } else {
      // Electron environment
      try {
        const result = await window.electronAPI.openDirectoryDialog();
        if (!result.canceled && result.filePaths.length > 0) {
          this.CLISettings.cc_path = result.filePaths[0];
          this.autoSaveSettings();
        }
      } catch (error) {
        console.error('Directory selection failed:', error);
        showNotification('Failed to select directory', 'error');
      }
    }
  },
  
  _toggleHighlight(e) {
    const blk = e.target.closest('.highlight-block');
    if (!blk) return;
    blk.classList.toggle('expanded');
  },
  changeSystemPrompt() {
    this.editContent = this.SystemPromptsList.find(prompt => prompt.id === this.selectSystemPromptId)?.content;
  },
/* -------------------------------------------------- */
/* 1. Automatically segment using the full-text algorithm */
/* -------------------------------------------------- */
reSegment() {
  this.stopSegmentTTS();          // Stop previous audio
    const {
      chunks,
      chunks_voice,
      remaining,
      remaining_voice
    } = this.splitTTSBuffer(this.readConfig.longText);

    if (remaining) {
      chunks.push(remaining);
      chunks_voice.push(remaining_voice);
    }

      /* Strip tags and whitespace, keeping arrays aligned */
      // 1. Strip HTML tags
      const cleanedChunks = chunks.map(txt => txt.replace(/<\/?[^>]+>/g, '').trim());

      // 2. Remove empty text and corresponding chunks_voice entries
      const finalChunks       = [];
      const finalChunksVoice  = [];

      cleanedChunks.forEach((txt, idx) => {
        if (txt) {                      // Keep only nonempty text
          finalChunks.push(txt);
          finalChunksVoice.push(chunks_voice[idx]);
        }
      });

      // 3. Replace original arrays
      chunks.length       = 0;
      chunks_voice.length = 0;
      chunks.push(...finalChunks);
      chunks_voice.push(...finalChunksVoice);
      /* ================================================================ */

  this.readState.ttsChunks = chunks;
  this.readState.chunks_voice = chunks_voice;
  this.readState.audioChunks  = new Array(this.readState.ttsChunks.length);
  this.readState.currentChunk = -1;
},

/* -------------------------------------------------- */
/* 2. Play one segment with VRM synchronization */
/* -------------------------------------------------- */
async playSingleSegment(idx) {
  try{
    if (!this.readState.ttsChunks[idx]) return;
    this.isReadingOnetext = true;
    this.readState.currentChunk = idx;
    const chunk = this.readState.ttsChunks[idx];
    const voice = this.readState.chunks_voice[idx];
    const cachedAudio = this.readState.audioChunks[idx];

    // Treat isolated playback as a fresh session
    this.sendTTSStatusToVRM('stopSpeaking', {});
    this.readState.vrmIndex = 0; // VRM receives index zero for any selected row
    this.sendTTSStatusToVRM('ttsStarted', { totalChunks: 1 });

    if (cachedAudio?.url && cachedAudio?.buffer && cachedAudio?.text === chunk && cachedAudio?.voice === voice) {
      this.doPlayAudio(this.readState.audioChunks[idx].url, idx, false);
      return;
    }
    
    // Synthesize on cache miss
    await this.synthSegment(idx);
    this.doPlayAudio(this.readState.audioChunks[idx].url, idx, false);
  } finally {
    this.isReadingOnetext = false;
  }
},

/* -------------------------------------------------- */
/* 3. Toggle continuous playback */
/* -------------------------------------------------- */
async toggleContinuousPlay() {
  if (this.readState.isPlaying) {          
    this.stopSegmentTTS(false);
    return;
  }
  this.readState.isPlaying = true;
  if (this.readState.currentChunk < 0 || this.readState.currentChunk >= this.readState.ttsChunks.length) { 
    this.readState.currentChunk = 0;         
  }

  // Interrupt previous playback and reset expected VRM index
  this.sendTTSStatusToVRM('stopSpeaking', {});
  this.readState.vrmIndex = 0; // Reset virtual index
  this.sendTTSStatusToVRM('ttsStarted', {
    totalChunks: this.readState.ttsChunks.length - this.readState.currentChunk
  });

  await this.playNextInQueue(true);
},

/* -------------------------------------------------- */
/* 4. Play only the next segment */
/* -------------------------------------------------- */
async playNextSegmentOnce() {
  let next = this.readState.currentChunk + 1;
  this.readState.currentChunk = next;
  if (next >= this.readState.ttsChunks.length) {
    next = 0;
    this.readState.currentChunk = next;
  }
  this.readState.isPlaying = false;      // Disable automatic continuation
  await this.playSingleSegment(next);    // Stop after playback
},

/* -------------------------------------------------- */
/* 5. Stop all segmented audio */
/* -------------------------------------------------- */
stopSegmentTTS(isEnd = true) {
  this.stopTTSActivities();
  if (isEnd){
    this.readState.currentChunk = -1;
  }
  if (this._curAudio) {
    this._curAudio.pause();
    this._curAudio = null;
  }
  this.readState.isPlaying   = false;
},
/* -------------------------------------------------- */
/* 6. Edit segment text */
/* -------------------------------------------------- */
toggleEditSegment(idx) {
  if (this.activeSegmentIdx === idx) {
    // Save temporary value into actual field
    this.readState.ttsChunks[idx] = this.segmentEditBuffer
    this.readState.chunks_voice[idx] = this.segmentVoiceEditBuffer[idx] ?? this.readState.chunks_voice[idx]
    this.activeSegmentIdx = -1
  } else {
    // Initialize temporary voice array when entering edit mode
    this.segmentEditBuffer = this.readState.ttsChunks[idx]
    // Assign directly in Vue 3
    this.segmentVoiceEditBuffer[idx] = this.readState.chunks_voice[idx]
    this.activeSegmentIdx = idx
  }
},

/* 1. Synthesis and audio conversion */
async synthSegment(idx) {
  try {
    const text  = this.readState.ttsChunks[idx];
    const voice = this.readState.chunks_voice[idx] || 'default';
    /* Clean text */
    let chunk_text = text;
    let chunk_expressions =[];
    if (text.indexOf('<') !== -1) {
      const tagReg = /<[^>]+>/g;
      chunk_expressions = (text.match(tagReg) || []).map(t => t.slice(1, -1));
      chunk_text = text.replace(tagReg, '').trim(); 
    }
    const res = await fetch('/tts', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ ttsSettings: this.ttsSettings, text, index: idx, voice }),
    });
    if (!res.ok) throw new Error('TTS failed');

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);

    /* Get binary ArrayBuffer directly rather than Base64 */
    const audioBuffer = await blob.arrayBuffer();

    /* Cache data */
    this.readState.audioChunks[idx] = {
      url,                       // Local playback URL
      expressions: chunk_expressions,
      buffer: audioBuffer,       // Binary data for VRM playback
      mimeType: blob.type,       // Actual MIME type
      text: chunk_text,
      idx,
      voice
    };
  } catch (e) {
    console.error(`TTS chunk ${idx} error`, e);
    this.readState.audioChunks[idx] = { 
      url: null, 
      buffer: null,
      expressions: [],
      text: "",
      idx 
    };
  }
},
scrollToCurrentChunk(idx) {
  // Wait for DOM update with nextTick
  this.$nextTick(() => {
    const segmentList = document.querySelector('.segment-list');
    const segmentItem = document.querySelector(`.segment-item:nth-child(${idx + 1})`);
    if (segmentList && segmentItem) {
      segmentItem.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  });
},

async doPlayAudio(url, idx, continuous = false) {
  // 1. Safely clean up previous audio
  if (this._curAudio) {
    // Notify VRM of interruption only when audio is forcibly stopped, not naturally ended
    const isActuallyPlaying = !this._curAudio.paused && !this._curAudio.ended;
    this._curAudio.pause();
    if (isActuallyPlaying) {
      this.sendTTSStatusToVRM('stopSpeaking', {});
    }
    this._curAudio = null;
  }

  try {
    const audio = new Audio(url);
    this._curAudio = audio;

    // Scroll to current row
    this.scrollToCurrentChunk(idx);

    const chunk = this.readState.audioChunks[idx];

    // 2. Prevent binary buffer consumption from breaking replay
    if (!chunk.buffer || chunk.buffer.byteLength === 0) {
        if (chunk.url) {
            try {
                const res = await fetch(chunk.url);
                chunk.buffer = await res.arrayBuffer();
                if (!chunk.mimeType) chunk.mimeType = res.headers.get('content-type') || 'audio/wav';
            } catch(e) {
                console.warn("Failed to restore buffer", e);
            }
        }
    }

    // 3. Get dedicated VRM virtual index
    if (this.readState.vrmIndex === undefined) {
        this.readState.vrmIndex = 0;
    }
    const currentVrmIndex = this.readState.vrmIndex;

    // 4. Send binary data to VRM with virtual index
    if ((this.vrmOnline || this.vtsOnline) && chunk.buffer && chunk.buffer.byteLength > 0) {
        const metadata = {
            type: 'audio_chunk',
            chunkIndex: currentVrmIndex, // Use virtual index
            text: chunk.text,
            expressions: chunk.expressions,
            mimeType: chunk.mimeType || 'audio/wav'
        };
        this.sendBinaryToVRM(metadata, chunk.buffer.slice(0));
    }

    this._curAudio.volume = this.vrmOnline ? 0.0000001 : 1; // Mute local playback while VRM is online

    // 5. Send state command with virtual index
    this.sendTTSStatusToVRM('startSpeaking', {
      chunkIndex: currentVrmIndex, // Use virtual index
      totalChunks: this.readState.ttsChunks.length,
      text: chunk.text,
      expressions: chunk.expressions || [],
      voice: this.readState.chunks_voice[idx] || 'default',
    });

    // 6. Advance index for sequential playback
    this.readState.vrmIndex++;

    // Listen for errors
    audio.addEventListener('error', (e) => {
      console.error('Audio load error', e);
      this.readState.currentChunk++;
      if (this.readState.currentChunk < this.readState.ttsChunks.length && continuous) {
        this.playNextInQueue(true);
      } else {
        this.stopSegmentTTS(false);
      }
    });

    await new Promise(resolve => {
      this._curAudio.addEventListener('ended', () => {
        // Use same virtual index in end notification
        this.sendTTSStatusToVRM('chunkEnded', { chunkIndex: currentVrmIndex });
        
        if (continuous && this.readState.isPlaying) {
          this.readState.currentChunk++;
          if (this.readState.currentChunk < this.readState.ttsChunks.length) {
            this.playNextInQueue(true);
          } else {
            this.stopSegmentTTS(false);
          }
        } else {
          this.stopSegmentTTS(false);
        }
        resolve();
      });
      
      console.log('play audio', `${idx + 1}`);
      audio.play().catch(e => {
        console.error('Audio play error', e);
        this.readState.currentChunk++;
        if (this.readState.currentChunk < this.readState.ttsChunks.length && continuous) {
          this.playNextInQueue(true);
        } else {
          this.stopSegmentTTS(false);
        }
        resolve(); 
      });
    });
  } catch (e) {
    console.error('Read playback error', e);
    this.readState.currentChunk++;
    if (this.readState.currentChunk < this.readState.ttsChunks.length && continuous) {
      this.playNextInQueue(true);
    } else {
      this.stopSegmentTTS(false);
    }
  } finally {
      this.isReadingOnetext = false;
  }
},

// Continuous playback: synthesize and play next segment
async playNextInQueue(continuous) {
  const idx = this.readState.currentChunk;   // Current segment index
  const chunk = this.readState.ttsChunks[idx];
  const voice = this.readState.chunks_voice[idx];
  const cachedAudio = this.readState.audioChunks[idx];

  // Use buffer rather than Base64
  if (cachedAudio?.url && cachedAudio?.buffer && cachedAudio?.text === chunk && cachedAudio?.voice === voice) {
    // No action on cache hit
  } else {
    await this.synthSegment(idx);
  }
  this.doPlayAudio(this.readState.audioChunks[idx].url, idx, continuous);
},

// Clear segments
clearSegments() {
  this.stopSegmentTTS();
  this.readState.ttsChunks   = [];
  this.readState.chunks_voice = [];
  this.readState.audioChunks  = [];
  this.readState.currentChunk = -1;
},
  // Scan extensions without auto-loading
  async scanExtensions() {
    try {
      // Retrieve extension list via API
      const response = await fetch('/api/extensions/list');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to retrieve extensions');
      }
      
      const data = await response.json();
      this.extensions = data.extensions || [];
      
      // Do not automatically open the first extension
      // Show sidePanelText by default
      this.currentExtension = null;
      this.sidePanelURL = '';
    } catch (error) {
      console.error('Extension scan failed:', error);
    }
  },
  
    // Load selected extension
  async loadExtension(extension) {
    if (!extension) {
      this.currentExtension = null;
      this.sidePanelURL = '';
      return;
    }
    
    /* 1. Try Node mode */
    try {
      const r = await fetch(`/api/extensions/${extension.id}/start-node`, { method: 'POST' });
      const res = await r.json();

      if (res.mode === 'node') {
        // Node startup succeeded
        this.currentExtension = extension;
        this.sidePanelURL = `/api/extensions/${extension.id}/node/`;
        showNotification(`${this.t('loadExtension(node)')}: ${extension.name}`, 'success');
        return;
      } else if (res.mode === 'error') {
        // Stop and report Node startup errors instead of falling through
        showNotification(`Extension service failed to start: ${res.message}`, 'error');
        console.error("[Node extension error]:", res.message);
        return; 
      }
      
      // Fall back to static route only when res.mode is static
    } catch (e) {
      // Also stop on network or parse errors
      showNotification(`Extension service request failed: ${e.message}`, 'error');
      console.error(e);
      return; 
    }

    /* 2. Static route fallback */
    this.currentExtension = extension;
    this.sidePanelURL = `/ext/${extension.id}/index.html`;
    showNotification(`${this.t('loadExtension(static)')}: ${extension.name}`, 'success');
    this.extensionsSystemPromptsDict[extension.id] = extension.systemPrompt || ""; // Update prompt
  },
  
// Switch to default home/bookmark view
  resetToDefaultView() {
    // 1. Clear focus to hide iframes via v-show and display home
    this.currentExtension = null;
    this.sidePanelURL = ''; // Clear old global URL
    this.activeSideView = 'list'; // Return sidebar routing to list

    // 2. Close any open dialogs
    this.showExtensionsDialog = false;

    // 3. Do not force changes to panel width
    // this.expandChatArea(); // Do not force chat expansion
    // this.collapseSidePanel(); // Keep sidebar open on home tab

    // 4. Clear extension system prompt on return to default conversation
    this.extensionsSystemPromptsDict = {}; 

    // 5. Stop task refresh timer when leaving task center
    if (this.taskRefreshTimer) {
      clearInterval(this.taskRefreshTimer);
      this.taskRefreshTimer = null; // Clear timer reference
    }

    console.log('Switched to sidebar home view');
  },
  // Open extension picker
  openExtensionsDialog() {
    this.showExtensionsDialog = true;
  },
  
// Switch to or open extension tab
  async switchExtension(extension) {
    // 1. Close extension dialog and expand sidebar
    this.showExtensionsDialog = false; 
    const sidePanel = this.$refs.sidePanelRef;
    if (sidePanel.style.width == 0 ){
        this.expandSidePanel();
    }

    // 2. Check whether extension is already open
    const existingExt = this.openedExtensions.find(e => e.id === extension.id);

    if (existingExt) {
      // Existing tab: focus without reloading to preserve state
      this.currentExtension = existingExt;
      this.activeSideView = 'iframe'; // Ensure iframe view mode
      
      // Synchronize sidePanelURL for compatibility
      if (existingExt.iframeUrl) {
        this.sidePanelURL = existingExt.iframeUrl;
      }
      
    } else {
      // First open: run loading logic
      // Set current extension immediately to display loading state
      this.currentExtension = extension;
      this.activeSideView = 'iframe';
      this.sidePanelURL = ''; // Clear global URL to prevent old content flashing
      
      // Add to top tab array
      this.openedExtensions.push(extension);

      // Run existing URL/token retrieval
      await this.loadExtension(extension);

      // loadExtension sets sidePanelURL after completion.
      // Store the generated URL on this extension object for later tab switches.
      const targetExt = this.openedExtensions.find(e => e.id === extension.id);
      if (targetExt) {
        // Bind generated URL to tab
        targetExt.iframeUrl = this.sidePanelURL; 
      }
    }
  },

  // Close extension tab
  closeExtensionTab(extId) {
    // 1. Remove from open tabs
    const index = this.openedExtensions.findIndex(e => e.id === extId);
    if (index === -1) return;
    
    this.openedExtensions.splice(index, 1);

    // 2. If closing the active tab, select a fallback
    if (this.currentExtension && this.currentExtension.id === extId) {
      if (this.openedExtensions.length > 0) {
        // Focus last remaining tab
        const lastExt = this.openedExtensions[this.openedExtensions.length - 1];
        this.switchExtension(lastExt);
      } else {
        // Return to home/list when none remain
        this.resetToDefaultView();
      }
    }
  },

  // Helper: resolve accessible extension URL, preferring Node over static
  async getExtensionURL(ext) {
    console.log('Get extension URL', ext);
    // 1. Try Node startup
    try {
      const r = await fetch(`/api/extensions/${ext.id}/start-node`, { method: 'POST' });
      const res = await r.json();
      if (res.mode === 'node') {
        return `/api/extensions/${ext.id}/node/`;   // Node proxy path
      }
      console.log('Node startup failed; falling back to static',res);
    } catch { 
     }
    // 2. Static fallback
    return `/ext/${ext.id}/index.html`;
  }, 

    async openExtension(extension) {
      const url = await this.getExtensionURL(extension);   // Resolve URL asynchronously
      console.log('Open extension', String(this.partyURL) + url);
      if (isElectron) {
        window.electronAPI.openExternal(`${this.partyURL}${url}`);
      } else {
        window.open(url, '_blank');
      }
    },
    // Delete extension
    async removeExtension(ext) {
      // Stop Node process if applicable, ignoring errors
      await fetch(`/api/extensions/${ext.id}/stop-node`, { method: 'POST' }).catch(() => {});
      try {
        const res = await fetch(`/api/extensions/${ext.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Deletion failed');
        showNotification(this.t('deleteSuccess'), 'success');
        this.scanExtensions(); // Refresh list
      } catch (e) {

         showNotification(e.message, 'error');
      }
    },

    // Open Add extension dialog
    openAddExtensionDialog() {
      this.newExtensionUrl = '';
      this.showExtensionForm = true;
      this.fetchRemotePlugins();
    },

    async pollInstallStatus(extId, onSuccess, onError) {
      const poll = async () => {
        try {
          const res = await fetch(`/api/extensions/task-status/${extId}`);
          const data = await res.json();

          if (data.status === 'success') {
            // Installation succeeded
            onSuccess(data.detail);
          } else if (data.status === 'error') {
            // Installation failed
            onError(data.detail);
          } else if (data.status === 'installing') {
             // Continue polling while installation is in progress
             // Example: console.log(data.detail);
             setTimeout(poll, 1000); // Check again in one second
          } else {
             // Unknown state, possibly caused by restart or invalid ID
             onError("Task state lost");
          }
        } catch (e) {
          onError("Network request failed");
        }
      };
      // Start polling
      poll();
    },

    // Install button handler
    async addExtension() {
      const url = this.newExtensionUrl.trim();
      if (!url) return showNotification('Enter a GitHub URL', 'error');
      
      this.installLoading = true; // Show loading overlay
      
      try {
        const res = await fetch('/api/extensions/install-from-github', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            url,
            backupUrl: ""  
          }),
        });
        
        if (res.status === 409) throw new Error(this.t('extensionExists'));
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.detail || this.t('deleteFailed'));
        }

        const resData = await res.json();
        const extId = resData.ext_id;

        // --- Start polling ---
        showNotification('Downloading in the background...', 'info');
        
        this.pollInstallStatus(
          extId,
          (msg) => {
            // Success callback
            this.installLoading = false;
            showNotification(msg || 'Installed successfully', 'success');
            this.showExtensionForm = false; // Close dialog
            this.scanExtensions(); // Refresh list immediately
          },
          (errMsg) => {
            // Failure callback
            this.installLoading = false;
            showNotification(`Installation failed: ${errMsg}`, 'error');
          }
        );

      } catch (e) {
        this.installLoading = false;
        showNotification(e.message, 'error');
      }
    },
    // Open file picker
    selectLocalZip() {
      this.$refs.zipInput.click();
    },

    // Upload selected file automatically
    async onZipSelected(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      
      this.installLoading = true;
      const form = new FormData();
      form.append('file', file);
      
      try {
        const res = await fetch('/api/extensions/upload-zip', {
          method: 'POST',
          body: form,
        });
        
        if (res.status === 409) throw new Error(this.t('extensionExists'));
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.detail || 'Upload failed');
        }
        
        const resData = await res.json();
        const extId = resData.ext_id;
        
        // Poll as for GitHub installation
        showNotification(this.t('waitExtensionInstall'), 'info');
        this.showExtensionForm = false;
        
        this.pollInstallStatus(
          extId,
          (msg) => {
            this.installLoading = false;
            showNotification(msg || this.t('installSuccess'), 'success');
            this.scanExtensions();
          },
          (errMsg) => {
            this.installLoading = false;
            showNotification(`${this.t('installFailed')}: ${errMsg}`, 'error');
          }
        );
        
      } catch (err) {
        this.installLoading = false;
        showNotification(err.message, 'error');
      } finally {
        e.target.value = '';
      }
    },

    async fetchRemotePlugins() {
      try {
        await this.scanExtensions(); // Refresh list
        const res = await fetch('/api/extensions/remote-list');
        const { plugins } = await res.json();   // Extract plugins array
        console.log(plugins);
        const localRes = await fetch('/api/extensions/list');
        const { extensions } = await localRes.json();
        console.log(extensions);
        this.remotePlugins = plugins.map(r => ({
          ...r,
          installed: extensions.some(l => l.repository.trim() === r.repository.trim()),
        }));
      } catch (e) {
        
      }
    },
    async togglePlugin(plugin) {
      if (plugin.installed) {
        // Existing uninstall handling
        await this.removeExtension(plugin);
        plugin.installed = false;
      } else {
        // --- Installation ---
        
        // 1. Set local loading state
        plugin.installing = true;
        this.installLoading = true; 

        try {
          // Get user-configured GitHub repository proxy
          const githubProxy = this.systemSettings.githubProxy || "";

          const res = await fetch('/api/extensions/install-from-github', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              url: plugin.repository,
              githubProxy: githubProxy // Use custom proxy rather than legacy backupRepository
            }),
          });

          if (res.status === 409) throw new Error('Extension already exists');
          if (!res.ok) throw new Error('Request failed');
          
          const resData = await res.json();
          const extId = resData.ext_id;

          showNotification('Download started...', 'info');

          // --- Start polling ---
          this.pollInstallStatus(
            extId,
            (msg) => {
              // Success
              this.installLoading = false;
              if (plugin) plugin.installing = false;
              plugin.installed = true; // Update frontend state
              showNotification('Installed successfully', 'success');
              this.scanExtensions(); // Refresh complete list to synchronize data
            },
            (errMsg) => {
              // Failure
              this.installLoading = false;
              if (plugin) plugin.installing = false;
              showNotification(`Installation failed: ${errMsg}`, 'error');
            }
          );

        } catch (e) {
          this.installLoading = false;
          if (plugin) plugin.installing = false;
          showNotification(e.message, 'error');
        }
      }
    },
  handleRefreshClick() {
    this.refreshing = true;
    
    // Call existing refresh method
    this.fetchRemotePlugins().then(() => {
      // After request completes
      this.refreshing = false;
      this.refreshButtonText = this.t('refreshedSuccess') || 'Refreshed';
      
      // Restore button text after two seconds
      setTimeout(() => {
        this.refreshButtonText = this.t('refreshList');
      }, 2000);
    }).catch(error => {
      // Handle errors
      this.refreshing = false;
      this.refreshButtonText = this.t('refreshFailed') || 'Refresh failed';
      
      // Restore button text after two seconds
      setTimeout(() => {
        this.refreshButtonText = this.t('refreshList');
      }, 2000);
    });
  },
  openRepository(url) {
    if (isElectron) {
      window.electronAPI.openExternal(url)   // Main process opens a separate closable window
    } else {
      window.open(url, '_blank')
    }
  },
  startChatHistoryResize(e) {
    if (this.isMobile || !this.chatHistoryPanelOpen) return;

    const container = this.$refs.chatWrapperRef;
    const panel = this.$refs.chatHistoryPanelRef;
    if (!container || !panel) return;

    this.isHistoryPanelResizing = true;
    const containerRect = container.getBoundingClientRect();
    const minWidth = 220;
    const maxWidth = Math.max(minWidth, Math.min(520, containerRect.width - 320));

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (event) => {
      if (!this.isHistoryPanelResizing) return;
      const nextWidth = Math.max(minWidth, Math.min(event.clientX - containerRect.left, maxWidth));
      this.chatHistoryPanelWidth = nextWidth;
    };

    const handleMouseUp = () => {
      this.isHistoryPanelResizing = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  },
  // Start drag resize
  startResize(e) {
    if (!this.chatAreaOpen || !this.sidePanelOpen) return;
    
    const container = this.$refs.chatWrapperRef;
    // Determine history sidebar visibility and width
    const historySidebar = container.querySelector('.chat-history-sidebar');
    const isSidebarVisible = this.showHistorySidebar && !this.isMobile;
    const sidebarWidth = isSidebarVisible ? historySidebar.offsetWidth : 0;

    this.isResizing = true;
    const containerRect = container.getBoundingClientRect();
    const availableWidth = containerRect.width - sidebarWidth; // Subtract history sidebar width
    
    container.classList.add('resizing');

    const handleMouseMove = (e) => {
      if (!this.isResizing) return;
      
      // mouseX must be relative to left edge of chat area
      const mouseXInChat = e.clientX - (containerRect.left + sidebarWidth);
      const clampedMouseX = Math.max(0, Math.min(mouseXInChat, availableWidth));
      
      const leftWidth = clampedMouseX;
      const rightWidth = availableWidth - clampedMouseX - 10; // Divider width is 10
      
      const leftPercent = (leftWidth / availableWidth) * 100;
      const rightPercent = (rightWidth / availableWidth) * 100;
      
      if (leftPercent < this.minPanelWidth) {
        this.collapseChatArea();
        handleMouseUp();
        return;
      }
      
      if (rightPercent < this.minPanelWidth) {
        this.collapseSidePanel();
        handleMouseUp();
        return;
      }
      
      this.updatePanelWidthsWithPixels(leftWidth, rightWidth);
    };

    const handleMouseUp = () => {
      this.isResizing = false;
      container.classList.remove('resizing');
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      this.recalculatePercentages(availableWidth);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  },

  handleHistoryToggle() {
      this.showHistorySidebar = !this.showHistorySidebar;
      console.log('showHistorySidebar:',this.showHistorySidebar)
      // Recalculate so remaining chat area fits available width
      this.$nextTick(() => {
          this.handleResize(); 
      });
      this.autoSaveSettings();
  },

  // Update panels using pixel widths
  updatePanelWidthsWithPixels(leftWidth, rightWidth) {
    this.$nextTick(() => {
      const chatArea = this.$refs.chatAreaRef;
      const sidePanel = this.$refs.sidePanelRef;
      
      if (!chatArea || !sidePanel) {
        return;
      }
      
      if (this.chatAreaOpen && this.sidePanelOpen) {
        chatArea.style.width = `${leftWidth}px`;
        sidePanel.style.width = `${rightWidth}px`;
      }
    });
  },

  // Recalculate percentages for persistence and responsive layout
  recalculatePercentages(providedAvailableWidth) {
    const container = this.$refs.chatWrapperRef;
    const historySidebar = container?.querySelector('.chat-history-sidebar');
    const sidebarWidth = (historySidebar && !this.isMobile) ? historySidebar.offsetWidth : 0;
    
    // Calculate width if not provided
    const availableWidth = providedAvailableWidth || (container.offsetWidth - sidebarWidth);
    
    const chatArea = this.$refs.chatAreaRef;
    const sidePanel = this.$refs.sidePanelRef;
    
    if (chatArea && sidePanel && this.chatAreaOpen && this.sidePanelOpen) {
      const chatAreaWidthPx = chatArea.offsetWidth;
      const sidePanelWidthPx = sidePanel.offsetWidth;
      
      // Calculate proportions from available width
      this.chatAreaWidth = (chatAreaWidthPx / availableWidth) * 100;
      this.sidePanelWidth = (sidePanelWidthPx / availableWidth) * 100;
    }
  },  

  // Handle divider click
  handleResizerClick(e) {
    if (e.target.closest('.expand-chat-btn') || e.target.closest('.expand-side-btn')) {
      return;
    }
    
    // Double-click resets to 50:50
    if (e.detail === 2) {
      this.resetPanelSizes();
    }
  },

  toggleSidePanel() {
    if (this.sidePanelOpen) {
      this.collapseSidePanel();
    } else {
      this.expandSidePanel();
    }
  },

  // Mobile single-panel switching
  toggleSidePanelOnMobile() {
    if (this.sidePanelOpen) {
      this.collapseSidePanel(); // Restore full-width conversation
    } else {
      this.expandSidePanel(); // Expand to full-width panel
    }
  },

 // Collapse conversation area
  collapseChatArea() {
    const sidePanel = this.$refs.sidePanelRef;
    const chatArea = this.$refs.chatAreaRef;

    if (sidePanel) sidePanel.style.width = '';
    if (chatArea) chatArea.style.width = '';

    this.chatAreaOpen = false;
    this.sidePanelOpen = true; 
    this.sidePanelWidth = 100;
    this.chatAreaWidth = 0;

    this.updatePanelWidths();
  },

  // Collapse right sidebar
  collapseSidePanel() {
    const chatArea = this.$refs.chatAreaRef;
    const sidePanel = this.$refs.sidePanelRef;

    if (chatArea) chatArea.style.width = '';
    if (sidePanel) sidePanel.style.width = '';

    if (!this.isResizing && this.sidePanelWidth > 0 && this.sidePanelWidth < 100) {
      this.savedSidePanelWidth = this.sidePanelWidth;
    }
    if (this.isResizing) {
      this.savedSidePanelWidth = null;
    }

    this.sidePanelOpen = false;
    this.chatAreaOpen = true;
    this.chatAreaWidth = 100;
    this.sidePanelWidth = 0;

    this.updatePanelWidths();
  },

  // Expand conversation area
  expandChatArea() {
    this.chatAreaOpen = true;
    if (this.isMobile) {
      // Exclusive full-screen mobile layout
      this.sidePanelOpen = false;
      this.chatAreaWidth = 100;
      this.sidePanelWidth = 0;
    } else {
      this.sidePanelOpen = true;
      this.chatAreaWidth = 50;
      this.sidePanelWidth = 50;
    }
    this.updatePanelWidths();
  },

  // Expand sidebar
  expandSidePanel() {
    this.sidePanelOpen = true;
    if (this.isMobile) {
      // Exclusive full-screen mobile layout
      this.chatAreaOpen = false;
      this.chatAreaWidth = 0;
      this.sidePanelWidth = 100;
    } else {
      this.chatAreaOpen = true;
      const saved = this.savedSidePanelWidth;
      if (saved && saved > 0 && saved < 100) {
        this.sidePanelWidth = saved;
        this.chatAreaWidth = 100 - saved;
      } else {
        this.chatAreaWidth = 50;
        this.sidePanelWidth = 50;
      }
    }
    this.updatePanelWidths();
  },


  // Reset panel sizes
  resetPanelSizes() {
    this.chatAreaWidth = 50;
    this.sidePanelWidth = 50;
    this.savedSidePanelWidth = null;
    this.chatAreaOpen = true;
    this.sidePanelOpen = true;
    this.updatePanelWidths();
  },

  // Update panel width styles
  updatePanelWidths() {
    this.$nextTick(() => {
      const chatArea = this.$refs.chatAreaRef;
      const sidePanel = this.$refs.sidePanelRef;
      
      if (!chatArea || !sidePanel) return;
      
      // Clear old pixel widths
      chatArea.style.width = '';
      sidePanel.style.width = '';
      
      if (this.chatAreaOpen && this.sidePanelOpen) {
        chatArea.style.width = `${this.chatAreaWidth}%`;
        sidePanel.style.width = `${this.sidePanelWidth}%`;
      } else if (this.chatAreaOpen) {
        chatArea.style.width = '100%';
      } else if (this.sidePanelOpen) {
        sidePanel.style.width = '100%';
      }
      
      // Force browser reflow by reading a layout property
      sidePanel.offsetWidth;   // Or read chatArea.offsetWidth
    });
  },

  // Handle window resize
  handleResize() {
    if (this.chatAreaOpen && this.sidePanelOpen) {
      this.updatePanelWidths();
    }
  },
  // openExtensionInWindow
  async openExtensionInWindow(extension) {
    const url = await this.getExtensionURL(extension);   // Resolve address after startup

    // Use asynchronously resolved URL
    this.showExtensionsDialog = false;
    let windowWidth = 800;
    let windowHeight = 600;
    if (window.electronAPI && window.electronAPI.openExtensionWindow) {
      try {
        if (extension.enableVrmWindowSize){
          console.log('VRM window size enabled')
          windowWidth = this.VRMConfig.windowWidth;
          windowHeight = this.VRMConfig.windowHeight
        }
        else{
          windowWidth = extension.width || 800;
          windowHeight = extension.height || 600;
        }
        const windowId = await window.electronAPI.openExtensionWindow(`${this.partyURL}${url}`, {
          id: extension.id,
          name: extension.name,
          transparent: extension.transparent || false,
          width: windowWidth,
          height: windowHeight,
        });
        console.log(`Extension window opened with ID: ${windowId}`);
      } catch (error) {
        console.error('Failed to open extension window:', error);
        window.open(`${this.partyURL}${url}`, '_blank');
      }
    } else {
      window.open(`${this.partyURL}${url}`, '_blank');
    }
  },
  async sherpaModelStatus() {
    const res = await fetch('/sherpa-model/status')
    if (!res.ok) return
    const { exists, model } = await res.json()
    this.sherpaModelExists = exists
    this.sherpaModelName  = model ?? ''   // Use empty value if backend does not return model name
  },

  async sherpaDownload(source = 'huggingface') {
      if (this.sherpaEventSource) this.sherpaEventSource.close()
      this.sherpaDownloading = true
      this.sherpaPercent = 0
      
      // Set state before creating EventSource
      this.sherpaEventSource = null

      const es = new EventSource(`/sherpa-model/download/${source}`)
      this.sherpaEventSource = es
      
      // Listen to message stream
      es.onmessage = e => {
          let data
          try {
              data = JSON.parse(e.data)
          } catch (error) {
              console.error('Failed to parse download progress data:', e.data, error)
              return
          }

          // --------------------------------------
          // Aggregate progress across multiple files
          // --------------------------------------
          
          // 1. Check for completion or failure
          if (data.status === 'complete') {
              es.close()
              this.sherpaDownloading = false
              this.sherpaPercent = 100
              this.sherpaModelStatus()
              showNotification(this.t('modelDownloadSuccess'))
              return
          }

          if (data.status === 'failed') {
              es.close()
              this.sherpaDownloading = false
              showNotification(this.t('modelDownloadFailed') + (data.error || ''), 'error')
              return
          }

          // 2. Aggregate file progress
          let totalDone = 0
          let grandTotal = 0

          if (data.files && data.files.length > 0) {
              data.files.forEach(file => {
                  totalDone += file.done || 0
                  grandTotal += file.total || 0
                  // Check for individual file failure
                  if (file.failed) {
                      es.close()
                      this.sherpaDownloading = false
                      showNotification(this.t('modelDownloadFailed') + `: ${file.filename} failed`, 'error')
                  }
              })
          }

          // 3. Calculate overall percentage
          this.sherpaPercent = grandTotal > 0 ? Math.round((totalDone / grandTotal) * 100) : 0
      }
      
      // Listen for errors
      es.onerror = () => {
          // EventSource closure without a close message usually signals failure
          es.close()
          this.sherpaDownloading = false
          showNotification(this.t('modelDownloadFailed'), 'error')
          this.sherpaModelStatus() // Recheck status in case download actually completed
      }
  },

  async sherpaRemove() {
    try {
      const res = await fetch('/sherpa-model/remove', { method: 'DELETE' })
      if (!res.ok) throw new Error()
      showNotification(this.t('deleteSuccess'))
      this.sherpaModelStatus()
    } catch {
      showNotification(this.t('deleteFailed'),'error')
    }
  },

  async loadSherpaStatus() {
    await this.sherpaModelStatus()
  },

// 1. Get MOSS model status
  async mossModelStatus() {
    try {
      const res = await fetch('/moss-model/status')
      if (!res.ok) return
      const data = await res.json()
      this.mossModelExists = data.exists
      
      // Synchronize backend download state after page refresh
      if (data.downloading) {
        this.mossDownloading = true
        // Resume polling automatically
        if (!this.mossPollInterval) this.startMossPolling()
      } else {
        this.mossDownloading = false
      }
    } catch (e) {
      console.error('Failed to get MOSS status:', e)
    }
  },

// Reset progress when starting download
  async mossDownload(source = 'huggingface') {
    this.mossDownloading = true
    this.mossDownloadSource = source
    this.mossPercent = 0 // Initialize to zero
    
    try {
      const res = await fetch(`/moss-model/download/${source}`, { method: 'POST' })
      if (!res.ok) throw new Error('Network error')
      this.startMossPolling()
    } catch (e) {
      this.mossDownloading = false
      showNotification(this.t('modelDownloadFailed') || 'Download failed', 'error')
    }
  },

  startMossPolling() {
    if (this.mossPollInterval) clearInterval(this.mossPollInterval)
    
    this.mossPollInterval = setInterval(async () => {
      try {
        const statusRes = await fetch('/moss-model/status')
        const data = await statusRes.json()
        
        // Update actual progress calculated from directory size
        if (data.percent !== undefined) {
          this.mossPercent = data.percent
        }
        
        if (!data.downloading) {
          clearInterval(this.mossPollInterval)
          this.mossPollInterval = null
          this.mossDownloading = false
          this.mossModelExists = data.exists
          
          if (data.exists) {
            this.mossPercent = 100 // Set 100 percent on completion
            showNotification(this.t('modelDownloadSuccess') || 'MOSS model downloaded')
          } else if (data.download_error) {
            showNotification((this.t('modelDownloadFailed') || 'Download failed: ') + data.download_error, 'error')
          }
        }
      } catch (err) {
        console.error('MOSS Polling error', err)
      }
    }, 1000) // Poll once per second
  },

  // 4. Delete MOSS model
  async mossRemove() {
    try {
      const res = await fetch('/moss-model/remove', { method: 'DELETE' })
      if (!res.ok) throw new Error()
      showNotification(this.t('deleteSuccess') || 'Model deleted')
      this.mossModelExists = false
    } catch {
      showNotification(this.t('deleteFailed') || 'Failed to delete model', 'error')
    }
  },

  // 5. Call at initialization, like loadSherpaStatus
  async loadMossStatus() {
    await this.mossModelStatus()
  },

    /**
     * Check whether MiniLM model exists.
     */
    async minilmModelStatus() {
        try {
            const res = await fetch('/minilm-model/status');
            if (!res.ok) throw new Error('Failed to fetch status');
            const data = await res.json();
            this.minilmModelExists = data.exists;
        } catch (error) {
            console.error("Error checking MiniLM model status:", error);
            this.minilmModelExists = false; // Treat network errors as unavailable model status
        }
    },

    /**
     * Download MiniLM model.
     * @param {string} source - Download source, Hugging Face
     */
    async minilmDownload(source = 'huggingface') {
        if (this.minilmEventSource) this.minilmEventSource.close();
        
        this.minilmDownloading = true;
        this.minilmPercent = 0;
        this.minilmEventSource = null;

        const es = new EventSource(`/minilm-model/download/${source}`);
        this.minilmEventSource = es;
        
        // Listen to message stream
        es.onmessage = async e => {
            let data;
            try {
                // Backend sends progress as JSON
                data = JSON.parse(e.data);
            } catch (error) {
                // Backend may send non-JSON close messages
                if (e.data === 'close') {
                    es.close();
                }
                console.error('Failed to parse download progress data:', e.data, error);
                return;
            }

            // 1. Check for completion or failure
            if (data.status === 'complete') {
                es.close();
                this.minilmDownloading = false;
                this.minilmPercent = 100;

                // 1. Notify backend to reload model
                await fetch('/minilm/reload', { method: 'POST' });

                // 2. Refresh availability status
                await this.minilmModelStatus();

                if (typeof showNotification === 'function') {
                    showNotification(this.t('modelDownloadSuccess'));
                }
                return;
            }

            if (data.status === 'failed') {
                es.close();
                this.minilmDownloading = false;
                // Extract specific errors from files list
                const firstError = data.files.find(f => f.failed)?.error || '';
                if (typeof showNotification === 'function') {
                    showNotification(this.t('modelDownloadFailed') + (firstError ? `: ${firstError}` : ''), 'error');
                }
                return;
            }

            // 2. Aggregate file progress
            let totalDone = 0;
            let grandTotal = 0;

            if (data.files && data.files.length > 0) {
                let hasFailedFile = false;
                data.files.forEach(file => {
                    totalDone += file.done || 0;
                    grandTotal += file.total || 0;
                    
                    // Check individual failures as a fallback to backend status
                    if (file.failed) {
                        hasFailedFile = true;
                    }
                });

                if (hasFailedFile) {
                      // If a file failed before status is updated, close and report the error
                      es.close();
                      this.minilmDownloading = false;
                      const failedFile = data.files.find(f => f.failed);
                      if (typeof showNotification === 'function') {
                        showNotification(this.t('modelDownloadFailed') + `: ${failedFile.filename} failed`, 'error');
                      }
                      return;
                }
            }

            // 3. Calculate overall percentage
            this.minilmPercent = grandTotal > 0 ? Math.round((totalDone / grandTotal) * 100) : 0;
        };
        
        // Listen for errors
        es.onerror = () => {
            // EventSource closure without a close message usually signals failure
            if (this.minilmEventSource) {
                this.minilmEventSource.close();
            }
            this.minilmDownloading = false;
            if (typeof showNotification === 'function') {
                showNotification(this.t('modelDownloadFailed') + ' (Network/Connection Error)', 'error');
            }
            this.minilmModelStatus(); // Recheck status in case download actually completed
        };
    },

    /**
     * Delete local MiniLM model.
     */
    async minilmRemove() {
        try {
            // Use Element Plus confirmation if available
            // Example: await this.$confirm('Delete the MiniLM model?', 'Warning', { type: 'warning' })

            const res = await fetch('/minilm-model/remove', { method: 'DELETE' });
            if (!res.ok) throw new Error();
            
            if (typeof showNotification === 'function') {
                showNotification(this.t('deleteSuccess'));
            }
            this.minilmModelStatus(); // Refresh model availability
        } catch (error) {
            if (typeof showNotification === 'function') {
                showNotification(this.t('deleteFailed') + (error.message || ''), 'error');
            }
        }
    },

  async updatePlugin(plugin) {
    // Temporary reactive state
    plugin._updating = true // Send update request
    try {
      const res = await fetch(`/api/extensions/${plugin.id}/update`, { method: 'PUT' })
      if (!res.ok) throw new Error(await res.text())
      showNotification(this.t('updateSuccess'))
      // Refresh local list and installed flags after update
      this.fetchRemotePlugins();
    } catch (e) {
      showNotification(this.t('updateFailed') + ': ' + e.message, 'error')
    } finally {
      plugin._updating = false
    }
  },

    // Open vector memory dialog
    async openVectorDialog(mid) {
      this.vectorDialogVisible = true
      this.vectorDialogMemoryId = mid
      // Use memory name for dialog title
      this.vectorDialogMemoryName = this.memories.find(m => m.id === mid)?.name || mid
      await this.loadVectorTable(mid)
    },

    // Read memory entries
    async loadVectorTable(mid) {
      this.vectorLoading = true
      try {
        const res = await fetch(`/memory/${mid}`)
        if (!res.ok) throw new Error(await res.text())
        // Backend already returns flattened data
        this.vectorTable = await res.json()
      } catch (e) {
        this.vectorTable = []
        console.error(e)
      } finally {
        this.vectorLoading = false
      }
    },

    // Add memory
    async addVectorRow() {
      if (!this.newVectorText.trim()) return
      this.vectorLoading = true
      try {
        const mid = this.vectorDialogMemoryId
        const res = await fetch(`/memory/${mid}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_text: this.newVectorText.trim() })
        })
        if (!res.ok) throw new Error(await res.text())
        this.newVectorText = ''
        await this.loadVectorTable(mid)
      } catch (e) {
        showNotification(e.message, 'error')
      } finally {
        this.vectorLoading = false
      }
    },

  startEditRow(tableIndex) {
    const row = this.vectorTable[tableIndex]
    this.editRowUuid = row.uuid
    this.editRowText = row.text
    this.editRowVisible = true
  },
  async submitEditRow() {
    if (!this.editRowText.trim()) return
    try {
      const mid = this.vectorDialogMemoryId
      const res = await fetch(`/memory/${mid}/${this.editRowUuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_text: this.editRowText.trim() })
      })
      if (!res.ok) throw new Error(await res.text())
      this.editRowVisible = false
      await this.loadVectorTable(mid)
    } catch (e) {
      showNotification(e.message, 'error')
    }
  },
  async deleteVectorRow(rowIndex) {
    const uuid = this.vectorTable[rowIndex]?.uuid
    if (!uuid) return
    try {
      const mid = this.vectorDialogMemoryId
      const res = await fetch(`/memory/${mid}/${uuid}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      await this.loadVectorTable(mid)
    } catch (e) {
      showNotification(e.message, 'error')
    }
  },
  /* Availability probe */
  async probeNode() {
    const res = await fetch('/api/node/probe');
    const { installed } = await res.json();
    this.nodeInstalled = installed;
  },

    /* ===== uv ===== */
  async probeUv() {
    const res = await fetch('/api/uv/probe');
    const { installed } = await res.json();
    this.uvInstalled = installed;
  },

  async openLogDialog() {
    this.showLogDialog = true;
    await this.fetchLogs();
    // Scroll to bottom automatically
    this.$nextTick(() => {
      if (this.$refs.logContainer) {
        this.$refs.logContainer.scrollTop = this.$refs.logContainer.scrollHeight;
      }
    });
  },

  async fetchLogs() {
    if (window.electronAPI) {
      try {
        this.logContent = await window.electronAPI.getBackendLogs();
      } catch (e) {
        this.logContent = 'Failed to load logs: ' + e.message;
      }
    }
  },
  async fetchSystemVoices() {
      this.isLoadingSystemVoices = true;
      try {
        // Call backend with fetch
        const response = await fetch('/system/voices'); // Use appropriate API prefix
        
        if (!response.ok) {
            // Handle HTTP error status
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.voices) {
          this.systemVoices = data.voices;
          
          // Select first voice if current selection is empty or unavailable
          const currentVoiceValid = this.systemVoices.some(v => v.id === this.ttsSettings.systemVoiceName);
          if (!this.ttsSettings.systemVoiceName || !currentVoiceValid) {
             if (this.systemVoices.length > 0) {
               this.ttsSettings.systemVoiceName = this.systemVoices[0].id;
               this.autoSaveSettings(); // Persist default selection
             }
          }
        }
      } catch (error) {
        console.error("Failed to retrieve system voices:", error);
        if (this.$message) {
           this.$message.error(`Failed to retrieve system voices: ${error.message}`);
        }
      } finally {
        this.isLoadingSystemVoices = false;
      }
    },

  addTableEnhancements() {
    this.$nextTick(() => {
      const tables = document.querySelectorAll('.markdown-body table');
      
      tables.forEach((table) => {
        if (table.parentElement.classList.contains('markdown-table-wrapper')) return;

        // 1. Create container
        const wrapper = document.createElement('div');
        wrapper.className = 'markdown-table-wrapper';
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);

        // 2. Create button
        const btn = document.createElement('button');
        btn.className = 'table-download-btn';
        // Use fa-file-excel icon
        btn.innerHTML = '<i class="fa-solid fa-file-excel"></i> XLSX';
        btn.title = 'Export to Excel';
        
        // 3. Bind click event to ExcelJS export
        btn.onclick = async (e) => {
          e.stopPropagation();
          // Optional loading feedback
          const originalText = btn.innerHTML;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exporting...';
          btn.disabled = true;
          
          try {
            await this.downloadTableAsXLSX(table);
          } catch (error) {
            console.error('Excel export failed:', error);
            this.$message?.error('Export failed. Please try again.');
          } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
          }
        };

        wrapper.appendChild(btn);
      });
    });
  },

  // Global click delegation
  handleGlobalClick(event) {
    // 1. Check if Excel export button was clicked
    // closest handles clicks on nested icon
    const btn = event.target.closest('.download-xlsx-trigger');
    
    if (btn) {
      event.preventDefault();
      event.stopPropagation();
      
      // Locate previous sibling table
      // Markdown renderer emits table followed by button
      // button.previousElementSibling is the table
      const table = btn.previousElementSibling;
      
      if (table && table.tagName === 'TABLE') {
        this.exportTable(btn, table);
      }
    }
  },

    handleMessageLinkClick(event) {
        // 1. Retain existing global click handling if applicable
        this.handleGlobalClick(event); 

        if(isElectron){

          const link = event.target.closest('a');

          if (link && link.href) {
              const href = link.href;

              // 2. Intercept HTTP and HTTPS links only
              if (href.startsWith('http') || href.startsWith('https')) {
                  
                  // Call both stopPropagation and preventDefault
                  event.preventDefault();  // Prevent default link navigation
                  event.stopPropagation(); // Stop event propagation
                  
                  // 3. Open internal browser
                  console.log('Opening intercepted link in internal browser:', href);
                  this.openUrlInNewTab(href);
              }
          }
        
        }

    },

  // Click handler with explicit parameters
  async exportTable(btn, tableElement) {
    if (btn.disabled) return; // Prevent duplicate clicks

    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exporting...';
    btn.disabled = true;

    try {
      await this.downloadTableAsXLSX(tableElement);
    } catch (error) {
      console.error('Export failed', error);
      // If Element Plus is available
      if (this.$message) this.$message.error('Export failed');
    } finally {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  },

  /**
   * Generate an actual .xlsx file with ExcelJS.
   */
  async downloadTableAsXLSX(tableElement) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Data Export');

    // --- 1. Extract HTML table data ---
    const rows = tableElement.querySelectorAll('tr');
    
    // Iterate HTML rows
    rows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll('td, th');
      const rowData = [];
      
      cells.forEach(cell => {
        // Get plain text
        rowData.push(cell.innerText.trim());
      });
      
      // Add to worksheet
      const excelRow = worksheet.addRow(rowData);
    });

    // --- 2. Format Excel workbook ---
    
    // 2.1 Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { 
      name: 'Calibri',
      bold: true, 
      color: { argb: 'FFFFFFFF' } // White text
    };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E849B' } // Dark teal theme color
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // 2.2 Calculate column widths
    worksheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) maxLength = columnLength;
      });
      // Limit maximum column width
      column.width = maxLength < 10 ? 10 : (maxLength > 50 ? 50 : maxLength + 2);
    });

    // 2.3 Add borders
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFDCDFE6' } },
          left: { style: 'thin', color: { argb: 'FFDCDFE6' } },
          bottom: { style: 'thin', color: { argb: 'FFDCDFE6' } },
          right: { style: 'thin', color: { argb: 'FFDCDFE6' } }
        };
        // Vertically center content
        cell.alignment = { ...cell.alignment, vertical: 'middle', wrapText: true };
      });
    });

    // --- 3. Generate and download file ---
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[-T:]/g, "");
    link.href = URL.createObjectURL(blob);
    link.download = `table_export_${timestamp}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  },

    // A2UI user action handling
    handleA2UIAction(msg) {
      console.log('A2UI Action Triggered:', msg);
      this.userInput = msg;
      this.sendMessage();
    },

    // Split message into text and UI segments
    splitMessageContent(content) {
      if (!content) return [];
      const segments = [];
      const regex = /```a2ui\s*([\s\S]*?)\s*```/g;
      
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(content)) !== null) {
        if (match.index > lastIndex) {
          const textPart = content.slice(lastIndex, match.index);
          if (textPart) segments.push({ type: 'text', content: textPart });
        }

        try {
          const uiConfig = JSON.parse(match[1]);
          segments.push({ type: 'ui', content: uiConfig });
        } catch (e) {
          segments.push({ type: 'text', content: match[0] });
        }
        lastIndex = regex.lastIndex;
      }

      if (lastIndex < content.length) {
        segments.push({ type: 'text', content: content.slice(lastIndex) });
      }

      return segments;
    },

    async fetchTetosNewVoices(provider) {
        this.newTTSConfig.isFetchingVoices = true;
        this.newTTSConfig.tetosVoices = []; // Clear existing voices
        
        let config = {};
        const s = this.newTTSConfig;

        // Build config based on provider
        switch(provider) {
            case 'azure':
                config = { speech_key: s.azureSpeechKey, speech_region: s.azureRegion };
                break;
            case 'fish':
                config = { api_key: s.fishApiKey };
                break;
            case 'google':
                // Try parsing JSON string
                try {
                    if (s.googleServiceAccount) {
                         config = { service_account: JSON.parse(s.googleServiceAccount) };
                    }
                } catch (e) {
                    this.newTTSConfig.isFetchingVoices = false;
                    return;
                }
                break;
        }

        try {
            const response = await fetch('/tts/tetos/list_voices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: provider, config: config })
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                this.newTTSConfig.tetosVoices = result.data;
            } else {
                console.error(result);
            }
        } catch (error) {
            console.error('Error fetching voices:', error);
        } finally {
            this.newTTSConfig.isFetchingVoices = false;
        }
    },

    async fetchTetosVoices(provider) {
        this.ttsSettings.isFetchingVoices = true;
        this.ttsSettings.tetosVoices = []; // Clear existing voices
        
        let config = {};
        const s = this.ttsSettings;

        // Build config based on provider
        switch(provider) {
            case 'azure':
                config = { speech_key: s.azureSpeechKey, speech_region: s.azureRegion };
                break;
            case 'fish':
                config = { api_key: s.fishApiKey };
                break;
            case 'google':
                // Try parsing JSON string
                try {
                    if (s.googleServiceAccount) {
                         config = { service_account: JSON.parse(s.googleServiceAccount) };
                    }
                } catch (e) {
                    this.ttsSettings.isFetchingVoices = false;
                    return;
                }
                break;
        }

        try {
            const response = await fetch('/tts/tetos/list_voices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: provider, config: config })
            });
            const result = await response.json();
            
            if (result.status === 'success') {
                this.ttsSettings.tetosVoices = result.data;
            } else {
                console.error(result);
            }
        } catch (error) {
            console.error('Error fetching voices:', error);
        } finally {
            this.ttsSettings.isFetchingVoices = false;
        }
    },

    // 1. Get voice display label
    getVoiceLabel(v) {
        // Case A: string
        if (typeof v === 'string') return v;
        
        // Case B: object, such as Azure
        if (v && typeof v === 'object') {
            // Prefer display name, then ID or name
            return v.DisplayName || v.local_name || v.name || v.Name || v.id || v.Id || v.ShortName || 'Unknown Voice';
        }
        return 'Unknown';
    },

    // 2. Get actual voice value passed to backend
    getVoiceValue(v) {
        // Case A: string
        if (typeof v === 'string') return v;
        
        // Case B: object
        if (v && typeof v === 'object') {
            return v.ShortName || v.id || v.Id || v.name || '';
        }
        return '';
    },

    // 3. Get auxiliary label such as language
    getVoiceDesc(v) {
        // Strings have no auxiliary information
        if (typeof v === 'string') return '';
        
        // Object may include language information
        if (v && typeof v === 'object') {
            const lang = v.Locale || v.locale || v.Language || v.language || (v.language_codes ? v.language_codes[0] : '');
            return lang ? `[${lang}]` : '';
        }
        return '';
    },


    // AI browser
    openUrlInNewTab(url) {
        // Validate URL if necessary
        if (!url) return;

        const newTab = {
            id: Date.now(),
            title: 'Loading...',
            url: url,
            favicon: '',
            isLoading: true,
            canGoBack: false,
            canGoForward: false
        };
        this.browserTabs.push(newTab);
        this.switchTab(newTab.id);
        this.activeMenu = 'ai-browser';
    },

    // Switch tab
    switchTab(id) {
        this.currentTabId = id;
        const tab = this.browserTabs.find(t => t.id === id);
        if (tab) {
            // --- Address display ---
            // Prefer actual currentUrl, otherwise tab.url
            this.urlInput = tab.currentUrl || tab.url;
            
            // Clear address bar on welcome page
            if (!tab.url) this.urlInput = '';
        }
    },

    // Add tab
    addNewTab() {
        const newTab = {
            id: Date.now(),
            title: 'New Tab',
            url: '',
            favicon: '',
            isLoading: false,
            canGoBack: false,
            canGoForward: false
        };
        this.browserTabs.push(newTab);
        this.switchTab(newTab.id);
    },

    // Close tab
    closeTab(id, event) {
        if (event) event.stopPropagation(); // Prevent triggering tab selection
        
        const index = this.browserTabs.findIndex(t => t.id === id);
        if (index === -1) return;

        // If closing active tab, select another
        if (this.currentTabId === id) {
            if (this.browserTabs.length > 1) {
                // Prefer right neighbor, otherwise left
                const nextTab = this.browserTabs[index + 1] || this.browserTabs[index - 1];
                this.currentTabId = nextTab.id;
                this.urlInput = nextTab.url;
            } else {
                // If only tab remains, replace with a new one
                this.addNewTab(); // Add new tab
                this.browserTabs.splice(index, 1); // Remove old tab
                return;
            }
        }
        
        this.browserTabs.splice(index, 1);
    },

    // Address bar Enter handler
    handleUrlEnter() {
        let val = this.urlInput.trim();
        if (!val) return;

        // Complete URL
        if (!/^https?:\/\//i.test(val)) {
            // If input resembles a domain
            if (/^([\w-]+\.)+[\w-]+/.test(val) && !val.includes(' ')) {
                val = 'https://' + val;
            } else {
                // Otherwise use search
                if (this.searchEngine === 'google') {
                    val = `https://www.google.com/search?q=${encodeURIComponent(val)}`;
                } else if (this.searchEngine === 'bing') {
                    val = `https://www.bing.com/search?q=${encodeURIComponent(val)}`;
                } else {
                    if (this.chromeMCPSettings.enabled == false || this.chromeMCPSettings.type != 'internal') {
                        showNotification(this.t('notEnabledInternalBrowserBontrol'), 'error')
                    }
                    this.showBrowserChat = true;
                    this.userInput = val;
                    this.sendMessage();
                    return;
                }
            }
        }

        this.navigateTo(val);
    },

    getTabIdByIndex(index) {
        if (index >= 0 && index < this.browserTabs.length) {
            return this.browserTabs[index].id;
        }
        return null;
    },

    // Welcome page search handler
    handleWelcomeSearch() {
        const query = this.welcomeSearchQuery.trim();
        this.welcomeSearchQuery = ''; // Clear input
        if (!query) return;

        // --- Detect URLs and navigate directly ---
        if (this.isUrl(query)) {
            let targetUrl = query;
            // Prepend https if scheme missing
            if (!/^https?:\/\//i.test(targetUrl)) {
                targetUrl = 'https://' + targetUrl;
            }
            this.navigateTo(targetUrl);
            return;
        }
        // ------------------------------------

        let searchUrl = '';
        if (this.searchEngine === 'google') {
            searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        } else if (this.searchEngine === 'bing') {
            searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
        } else {
            if (this.chromeMCPSettings.enabled == false || this.chromeMCPSettings.type != 'internal') {
                showNotification(this.t('notEnabledInternalBrowserBontrol'), 'error')
            }
            this.showBrowserChat = true;
            this.userInput = query;
            this.sendMessage();
            return;
        }

        this.navigateTo(searchUrl);
    },

    /**
     * Determine whether a string is a URL.
     * Rules:
     * 1. Starts with HTTP or HTTPS
     * 2. Or matches a domain such as google.com
     * 3. Or localhost
     * 4. Or IP address
     * 5. Contains no spaces
     */
    isUrl(str) {
        // Treat spaces as a sign of search input
        if (str.includes(' ')) return false;

        // Regex explanation:
        // Optional HTTP or HTTPS scheme
        // (
        // Domain name
        // Localhost
        // IPv4 address
        // )
        // Optional port
        // Optional path
        const pattern = /^(https?:\/\/)?(([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}|localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/.*)?$/i;
        
        return pattern.test(str);
    },

    // Navigation method
    navigateTo(url) {
        if (!this.currentTab) return;
        
        // Refresh if URL unchanged
        // Compare currentUrl as well
        const activeUrl = this.currentTab.currentUrl || this.currentTab.url;
        
        if (activeUrl === url) {
            // ... (retain reload logic)
            const wv = document.getElementById('webview-' + this.currentTabId);
            if (wv) wv.reload();
            return;
        }

        // 2. New URL
        this.currentTab.url = url;      // Updating src triggers loading
        this.currentTab.currentUrl = url; // Synchronize actual address state
        this.urlInput = url;
    },
    
    // Return to home/new tab
    goHome() {
        if(this.currentTab) {
            this.currentTab.url = '';
            this.currentTab.title = 'New Tab';
            this.currentTab.favicon = '';
            this.urlInput = '';
        }
    },

    // --- Webview navigation controls ---
    getWebview(id) {
        const wv = document.getElementById('webview-' + (id || this.currentTabId));
        
        // 1. Basic existence check
        if (!wv) {
            console.warn("getWebview: Element not found for ID", id || this.currentTabId);
            return null;
        }

        // 2. Check whether element is connected to DOM
        // isConnected false indicates destruction or incomplete mounting
        // Return null so Python can handle No active webview and retry
        if (!wv.isConnected) {
            console.warn("getWebview: Element found but detached from DOM (Zombie node).");
            return null;
        }

        // 3. Optional Electron readiness check
        // getWebContentsId may fail if webview is not initialized
        try {
            if (typeof wv.getWebContentsId !== 'function') {
                return null;
            }
        } catch (e) {
            return null;
        }

        return wv;
    },

    browserGoBack() {
        const wv = this.getWebview();
        if (wv && wv.canGoBack()) wv.goBack();
    },

    browserGoForward() {
        const wv = this.getWebview();
        if (wv && wv.canGoForward()) wv.goForward();
    },

    browserReload() {
        const wv = this.getWebview();
        if(!wv) return;
        if (this.currentTab.isLoading) {
            wv.stop();
        } else {
            wv.reload();
        }
    },

    // --- Webview event listeners ---
    // Events bound in HTML through did-start-loading and related handlers
    
    onDidStartLoading(id) {
        const tab = this.browserTabs.find(t => t.id === id);
        if (tab) tab.isLoading = true;
    },

    // Previous implementation
    onDidStopLoading(id) {
        const tab = this.browserTabs.find(t => t.id === id);
        if (tab) {
            tab.isLoading = false;
            const wv = document.getElementById('webview-' + id);
            if (wv) {
                tab.canGoBack = wv.canGoBack();
                tab.canGoForward = wv.canGoForward();
                
                // --- Updated URL handling ---
                if (wv.getURL()) {
                    // 1. Store actual URL separately without changing tab.url/src
                    tab.currentUrl = wv.getURL(); 
                    
                    // 2. Update only address bar
                    if (this.currentTabId === id) {
                        this.urlInput = tab.currentUrl;
                    }
                }
            }
        }
    },

    onPageTitleUpdated(id, event) {
        const tab = this.browserTabs.find(t => t.id === id);
        if (tab) tab.title = event.title;
    },

    onPageFaviconUpdated(id, event) {
        const tab = this.browserTabs.find(t => t.id === id);
        if (tab && event.favicons && event.favicons.length > 0) {
            tab.favicon = event.favicons[0];
        }
    },

    // Handle window.open from web content
    onNewWindow(id, event) {
        // Open in internal tab rather than external window
        const { url } = event;
        const newTab = {
            id: Date.now(),
            title: 'Loading...',
            url: url,
            favicon: '',
            isLoading: true,
            canGoBack: false,
            canGoForward: false
        };
        this.browserTabs.push(newTab);
        this.switchTab(newTab.id);
    },
    
    // onDomReady handler
    onDomReady(tabId) {
        const webview = document.getElementById('webview-' + tabId);
        if (!webview) return;

        webview.addEventListener('context-menu', (e) => {
            // Log parameters from Electron for debugging
            console.log('Webview Context Menu Params:', e.params);
            
            const params = e.params;
            let menuType = 'default';
            let data = {};

            // Check the most specific context matches first
            if (params.mediaType === 'image' && params.srcURL && params.srcURL.length > 0) {
                menuType = 'image';
                data = { src: params.srcURL };
                console.log('Detected Image Context:', data); // Debug
            } else if (params.linkURL && params.linkURL.length > 0) {
                menuType = 'link';
                data = { 
                    url: params.linkURL, 
                    text: params.linkText || params.selectionText || '' 
                };
                console.log('Detected Link Context:', data); // Debug
            } else if (params.selectionText && params.selectionText.length > 0) {
                menuType = 'text';
                data = { text: params.selectionText };
                console.log('Detected Text Context:', data); // Debug
            } else {
                menuType = 'default';
                console.log('Detected Default Context'); // Debug
            }

            // Log selected context type and data
            console.log(`Sending context menu request: Type = ${menuType}, Data =`, data);

            window.electronAPI.showContextMenu(menuType, data);
        });
        webview.send('set-i18n', {
            translate: this.t('translate') || 'Translate',
            askAI: this.t('ask_ai') || 'Ask AI',
            read: this.t('read') || 'Read aloud',
            copy: this.t('copy') || 'Copy'
        });
        //webview.openDevTools();
    },

    // 1. IPC message handler
    async handleWebviewIpcMessage(event) {
        if (event.channel === 'ai-toolbar-action') {
            const { action, text } = event.args[0];
            if (!text) return;

            // Get webview instance for returning data
            // event.target is webview element
            const webview = event.target; 

            switch (action) {
                case 'translate':
                    // --- 1. Translate or summarize using backend stream ---
                    // Display in webview without opening sidebar
                    this.streamTranslateInWebview(webview, text);
                    break;

                case 'ask':
                    // --- 2. Ask AI: open sidebar ---
                    this.showBrowserChat = true;
                    // To add a prompt automatically:
                    this.userInput = `${text}`; 
                    // this.sendMessage(); // Uncomment to send automatically; otherwise let the user send it.
                    break;

                case 'read':
                    // --- 3. Read aloud: call TTS ---
                    this.handleBrowserTTS(text);
                    break;
            }
        }
    },

    // 2. Stream the backend response to the Webview
    async streamTranslateInWebview(webview, text) {
        if (!webview) return;
        
        console.log('Requesting translation:', text);
        webview.send('ai-stream-start');

        try {
            const host = window.electron?.server?.host || '127.0.0.1';
            const port = window.electron?.server?.port || 3456;
            const apiUrl = `http://${host}:${port}/simple_chat`;
            const targetLang = this.target_lang || 'Simplified Chinese';
            const sysPrompt = `You are a helpful translation assistant. Translate the following text to ${targetLang}. Only output the translated text.`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [
                        { role: "system", content: sysPrompt },
                        { role: "user", content: text }
                    ],
                    stream: true
                })
            });

            if (!response.ok) {
              let errMsg = `API Error: ${response.status}`;
              try { const errData = await response.json(); errMsg = errData?.error?.message || errMsg; } catch (_) {}
              throw new Error(errMsg);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); 

                for (const line of lines) {
                    let trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]') continue;
                    
                    // --- Support multiple response formats ---
                    
                    // 1. Strip the data: prefix from SSE lines
                    if (trimmed.startsWith('data:')) {
                        trimmed = trimmed.replace(/^data:\s?/, '');
                    }
                    
                    // 2. Parse JSON with or without the SSE prefix
                    try {
                        const data = JSON.parse(trimmed);
                        const content = data.choices?.[0]?.delta?.content;
                        
                        if (content) {
                            // console.log('Chunk:', content); 
                            webview.send('ai-stream-chunk', content);
                        }
                    } catch (e) {
                        // Ignore non-JSON lines, such as heartbeats or comments
                        // console.log('Json parse failed for line:', trimmed);
                    }
                }
            }
            
            webview.send('ai-stream-end');
            console.log('Streaming complete');

        } catch (error) {
            console.error('Translation error:', error);
            webview.send('ai-stream-chunk', `\n[Error: ${error.message}]`);
        }
    },

    // 3. TTS handling
    handleBrowserTTS(text) {
        // Stop previous playback, if any
        this.stopTTSActivities();
        
        // Set the long text content
        this.readConfig.longText = text;
        
        // Allow state to update before starting playback
        setTimeout(() => {
            this.startRead();
            
            // Notify the user (optional)
            // showNotification(this.t('tts_started'), 'success');
        }, 500);
    },

    // Toggle engine dropdown
    toggleEngineDropdown() {
        this.showEngineDropdown = !this.showEngineDropdown;
    },

    // Set engine and close dropdown
    setSearchEngine(engine) {
        this.searchEngine = engine;
        this.showEngineDropdown = false;
        // Optionally focus the input after switching
        this.$nextTick(() => {
            const input = document.querySelector('.ios-search-input');
            if(input) input.focus();
        });
    },

    // Delay closing the dropdown on blur so menu items can be clicked
    handleSearchBlur() {
        this.isSearchFocused = false;
        setTimeout(() => {
            this.showEngineDropdown = false;
        }, 200);
    },

    // Ensure new tabs have the correct style
    addNewTab() {
        const newTab = {
            id: Date.now(),
            title: 'New Tab',
            url: '',
            favicon: '',
            isLoading: false,
            canGoBack: false,
            canGoForward: false
        };
        this.browserTabs.push(newTab);
        this.switchTab(newTab.id);
        
        // Focus the welcome page search field
        this.$nextTick(() => {
             const input = document.querySelector('.ios-search-input');
             if(input) input.focus();
        });
    },

    handleSelectorEnter() {
        if (this.dropdownTimer) clearTimeout(this.dropdownTimer);
        this.showEngineDropdown = true;
    },

    // Delay closing by 200ms on mouse leave
    handleSelectorLeave() {
        this.dropdownTimer = setTimeout(() => {
            this.showEngineDropdown = false;
        }, 200); // 200ms delay
    },

    // Edge scrolling
    handleTabsMouseMove(e) {
      // Access DOM through this.$refs in the Options API
      const container = this.$refs.tabsContainerRef;
      
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left; // Mouse offset from the left edge of the container
      const width = rect.width;
      const threshold = 60; // Edge scrolling threshold (px)
      const speed = 8;      // Scroll speed

      // Clear any existing timer
      this.stopEdgeScroll();

      // Define the scrolling function
      const scroll = (direction) => {
        if (direction === 'left') {
          container.scrollLeft -= speed;
        } else {
          container.scrollLeft += speed;
        }
        // Continue scrolling
        this.scrollInterval = requestAnimationFrame(() => scroll(direction));
      };

      // Check mouse position
      if (x < threshold) {
        // Left edge: scroll left
        scroll('left');
      } else if (x > width - threshold) {
        // Right edge: scroll right
        scroll('right');
      } else {
        // Center: stop scrolling
        this.stopEdgeScroll();
      }
    },

    // Stop scrolling
    stopEdgeScroll() {
      if (this.scrollInterval) {
        cancelAnimationFrame(this.scrollInterval);
        this.scrollInterval = null;
      }
    },


    controlDownload(id, action) {
        window.downloadAPI.controlDownload(id, action);
    },

    handleStopOrRemove(item) {
        if (item.state === 'progressing' || item.state === 'paused') {
            // Cancel an active download
            this.controlDownload(item.id, 'cancel');
        } else {
            // Remove completed or canceled records from the list
            this.downloads = this.downloads.filter(d => d.id !== item.id);
        }
    },

    openFileFolder(path) {
        if(path) window.downloadAPI.showItemInFolder(path);
    },

    clearFinishedDownloads() {
        // Keep only active downloads
        this.downloads = this.downloads.filter(d => d.state === 'progressing' || d.state === 'paused');
    },

    // Byte formatting utility
    formatBytes(bytes, decimals = 1) {
        if (!bytes) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    },
    handleDropdownEnter() {
        // 1. Cancel any pending close timer
        if (this.dropdownTimer) {
            clearTimeout(this.dropdownTimer);
            this.dropdownTimer = null;
        }
        // 2. Show the panel
        this.showDownloadDropdown = true;
    },

    // Mouse leave
    handleDropdownLeave() {
        // Give the user 300ms to move the mouse
        this.dropdownTimer = setTimeout(() => {
            this.showDownloadDropdown = false;
            this.dropdownTimer = null;
        }, 300); 
    },

    async initChromeMCPSettings() {
        if (!window.electronAPI) return;

        // 1. Ask the main process whether CDP is enabled and which port it uses
        const cdpInfo = await window.electronAPI.getInternalCDPInfo();
        
        // 2. If internal mode is enabled in the main process
        if (cdpInfo.active) {
            console.log("[Frontend] Internal CDP active on port: " + cdpInfo.port);
            
            // Synchronize frontend data
            this.chromeMCPSettings.type = 'internal'; 
            this.chromeMCPSettings.CDPport = cdpInfo.port;
            
            // Do not force enabled = true; enabled represents whether the Python service is running
            // An open Electron port usually indicates enabled is true in the configuration
            // Update configuration to reflect the current port
            await this.autoSaveSettings();
        }
    },
    // ===============================================
    // Python Agent interface (Electron API bridge)
    // ===============================================

    // --- Basic information and navigation ---

    getPagesInfo() {
        const info = this.browserTabs.map((tab, index) => ({
            index: index,
            id: tab.id,
            title: tab.title || 'Loading...',
            url: tab.url || '',
            active: tab.id === this.currentTabId
        }));
        return JSON.stringify(info);
    },

    closeTabByIndex(index) {
        const tabId = this.getTabIdByIndex(index);
        if (tabId) {
            this.closeTab(tabId);
            return "Closed tab index " + index;
        }
        return "Error: Tab index " + index + " not found";
    },

    switchTabByIndex(index) {
        const tabId = this.getTabIdByIndex(index);
        if (tabId) {
            this.switchTab(tabId);
            this.activeMenu = 'ai-browser';
            return "Selected tab index " + index;
        }
        return "Error: Tab index " + index + " not found";
    },

    browserNavigate(type, url, ignoreCache) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";

        try {
            this.activeMenu = 'ai-browser'; // Switch to AI Browser menu
            switch (type) {
                case 'url':
                    if (!url) return "Error: URL is required";
                    this.navigateTo(url);
                    return "Navigating to " + url;
                case 'back':
                    if (wv.canGoBack()) {
                        wv.goBack();
                        return "Navigated Back";
                    }
                    return "Error: Cannot go back";
                case 'forward':
                    if (wv.canGoForward()) {
                        wv.goForward();
                        return "Navigated Forward";
                    }
                    return "Error: Cannot go forward";
                case 'reload':
                    if (ignoreCache) wv.reloadIgnoringCache();
                    else wv.reload();
                    return "Reloaded";
                default:
                    // Default to URL navigation
                    if (url) {
                        this.navigateTo(url);
                        return "Navigated to " + url;
                    }
                    return "Error: Unknown navigation type";
            }
        } catch (e) {
            return "Navigation Exception: " + e.message;
        }
    },

    // ===============================================
    // Python Agent interface (JavaScript injection)
    // ===============================================

    // --- 0. Interaction delay helper ---
    async _humanDelay() {
        // Random delay from 100ms to 1000ms
        const delay = Math.floor(Math.random() * 900) + 100;
        await new Promise(resolve => setTimeout(resolve, delay));
    },

    // --- 1. Accessibility-style snapshot (no delay for read operations) ---
    async getWebviewSnapshot(verbose = false) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        if (wv.isLoading()) return "Error: Page is loading...";

        const script = `
        (function() {
            try {
                if (!window._ai_uid_counter) window._ai_uid_counter = 1;
                const interactiveSelector = 'a, button, input, textarea, select, details, label, summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [onclick]';
                
                function isVisible(el) {
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && el.offsetWidth > 0;
                }

                function getSafeText(el) {
                    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
                    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.value || el.getAttribute('placeholder') || '';
                    if (el.tagName === 'SELECT') return el.options[el.selectedIndex]?.text || '';
                    return el.innerText ? el.innerText.slice(0, 50).replace(/[\\r\\n]+/g, ' ').trim() : '';
                }

                function getRole(el) {
                    if (el.getAttribute('role')) return el.getAttribute('role');
                    return el.tagName.toLowerCase();
                }

                const elements = document.querySelectorAll(interactiveSelector);
                const lines = [];

                elements.forEach(el => {
                    if (!isVisible(el)) return;
                    let uid = el.getAttribute('data-ai-id');
                    if (!uid) {
                        uid = 'ai-' + window._ai_uid_counter++;
                        el.setAttribute('data-ai-id', uid);
                    }
                    const role = getRole(el);
                    const name = getSafeText(el);
                    const value = (el.value && el.value !== name) ? el.value : '';
                    
                    let line = \`[\${uid}] \${role}\`;
                    if (name) line += \` "\${name}"\`;
                    if (value) line += \` Value: "\${value}"\`;

                    lines.push(line);
                });

                if (lines.length === 0) return "Page empty or no interactive elements found.";
                return lines.join('\\n');
            } catch (e) {
                return "Snapshot Script Error: " + e.message;
            }
        })()
        `;
        
        try {
            return await wv.executeJavaScript(script);
        } catch (e) {
            return "Vue Snapshot Error: " + e.message;
        }
    },

    // --- 2. Click (with delay) ---
    async webviewClick(uid, dblClick = false) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        wv.focus();
        const script = `
        (async function() {
            const el = document.querySelector('[data-ai-id="${uid}"]');
            if (!el) return "Element not found: ${uid}";
            
            // 1. Smoothly scroll into view
            el.scrollIntoView({behavior: "smooth", block: "center", inline: "center"});
            
            // Wait briefly for scrolling to finish
            await new Promise(r => setTimeout(r, 200));

            // 2. Calculate random coordinates
            const rect = el.getBoundingClientRect();
            // Choose a position within the central 80% of the element
            // Math.random() - 0.5 yields a value between -0.5 and 0.5
            const randomX = (Math.random() - 0.5) * (rect.width * 0.8); 
            const randomY = (Math.random() - 0.5) * (rect.height * 0.8);
            
            // Offset from the element bounds and center to obtain viewport coordinates
            // clientX/Y are relative to the viewport
            const clientX = rect.left + (rect.width / 2) + randomX;
            const clientY = rect.top + (rect.height / 2) + randomY;

            // 3. Construct event object with coordinates
            const opts = { 
                bubbles: true, 
                cancelable: true, 
                view: window, 
                buttons: 1,
                clientX: clientX,
                clientY: clientY,
                screenX: clientX + window.screenX, // Simulated screen coordinates
                screenY: clientY + window.screenY
            };

            // 4. Dispatch the complete event sequence
            el.dispatchEvent(new MouseEvent('mouseover', opts));
            el.dispatchEvent(new MouseEvent('mousedown', opts));
            // Brief pause between mouse down and mouse up
            await new Promise(r => setTimeout(r, Math.floor(Math.random() * 50) + 10)); 
            el.dispatchEvent(new MouseEvent('mouseup', opts));
            el.dispatchEvent(new MouseEvent('click', opts));
            
            if (${dblClick}) {
                el.dispatchEvent(new MouseEvent('dblclick', opts));
            }
            return "Clicked " + "${uid}";
        })()
        `;
        
        try {
            const result = await wv.executeJavaScript(script);
            // Post-interaction delay
            await this._humanDelay();
            return result;
        } catch (e) {
            return "Click Error: " + e.message;
        }
    },

    // --- 3. Input (with delay) ---
    async webviewFill(uid, value) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        wv.focus();
        // Pass value to JavaScript using JSON.stringify for safe serialization
        const script = `
        (async function() {
            const el = document.querySelector('[data-ai-id="${uid}"]');
            if (!el) return "Element not found: ${uid}";
            
            el.focus();
            
            const text = ${JSON.stringify(value)};
            
            // Obtain the native setter so React/Vue can observe the assignment
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            
            // Clear existing content (omit for append mode)
            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(el, '');
            } else {
                el.value = '';
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));

            // Character-by-character input loop
            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                
                // 1. Simulate keydown
                el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
                el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));

                // 2. Update the input value
                const currentVal = el.value + char;
                if (nativeInputValueSetter && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                    nativeInputValueSetter.call(el, currentVal);
                } else {
                    el.value = currentVal;
                }

                // 3. Dispatch input so the framework observes the change
                el.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true }));
                
                // 4. Simulate keyup
                el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

                // 5. Random typing delay (30ms - 150ms)
                // Vary the typing interval
                const delay = Math.floor(Math.random() * 120) + 30;
                await new Promise(r => setTimeout(r, delay));
            }

            // Dispatch change when finished
            el.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Pause briefly before blurring
            await new Promise(r => setTimeout(r, 200));
            el.blur();

            return "Filled " + "${uid}";
        })()
        `;
        
        try {
            const result = await wv.executeJavaScript(script);
            // Post-interaction delay
            await this._humanDelay();
            return result;
        } catch (e) {
            return "Fill Error: " + e.message;
        }
    },

    // --- 4. Batch form filling (with delay) ---
    async webviewFillForm(elements) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        wv.focus();
        const dataStr = JSON.stringify(elements); 

        const script = `
        (function() {
            const items = ${dataStr};
            const log = [];
            items.forEach(item => {
                const el = document.querySelector('[data-ai-id="' + item.uid + '"]');
                if (el) {
                    el.focus();
                    el.value = item.value;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    log.push(item.uid);
                }
            });
            return "Filled elements: " + log.join(', ');
        })()
        `;
        
        const result = await wv.executeJavaScript(script);
        
        // Wait after batch operation
        await this._humanDelay();
        
        return result;
    },

    // --- 5. Drag (with delay) ---
    async webviewDrag(fromUid, toUid) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        wv.focus();
        const script = `
        (function() {
            const src = document.querySelector('[data-ai-id="${fromUid}"]');
            const tgt = document.querySelector('[data-ai-id="${toUid}"]');
            if (!src || !tgt) return "Elements not found";

            const srcRect = src.getBoundingClientRect();
            const tgtRect = tgt.getBoundingClientRect();
            const clientX = srcRect.left + srcRect.width / 2;
            const clientY = srcRect.top + srcRect.height / 2;
            const targetX = tgtRect.left + tgtRect.width / 2;
            const targetY = tgtRect.top + tgtRect.height / 2;

            const emit = (type, x, y) => {
                const ev = new MouseEvent(type, { 
                    bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, buttons: 1 
                });
                (type === 'mouseup' ? tgt : src).dispatchEvent(ev);
            };

            emit('mousedown', clientX, clientY);
            emit('mousemove', clientX + 5, clientY + 5); 
            emit('mousemove', targetX, targetY);         
            emit('mouseup', targetX, targetY);           

            return "Dragged " + "${fromUid}" + " to " + "${toUid}";
        })()
        `;
        
        const result = await wv.executeJavaScript(script);
        
        // Allow a slightly longer delay after dragging; reuse the random wait
        await this._humanDelay();
        
        return result;
    },

    // --- 6. Hover (with delay) ---
    async webviewHover(uid) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        wv.focus();
        const script = `
        (function() {
            const el = document.querySelector('[data-ai-id="${uid}"]');
            if (!el) return "Element not found";
            el.scrollIntoView({block: "center"});
            el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            return "Hovered " + "${uid}";
        })()
        `;
        
        const result = await wv.executeJavaScript(script);
        
        // Allow a brief wait after hovering
        await this._humanDelay();
        
        return result;
    },

    // --- 8. Handle dialogs (no delay) ---
    async webviewHandleDialog(action, promptText) {
        // Dialog handling is usually instantaneous
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        wv.focus();
        const script = `
        (function() {
            window.__ai_dialog_action = "${action}"; 
            window.__ai_dialog_text = ${JSON.stringify(promptText || "")};
            window.alert = function() { return true; };
            window.confirm = function() { return window.__ai_dialog_action === 'accept'; };
            window.prompt = function() { return window.__ai_dialog_action === 'accept' ? window.__ai_dialog_text : null; };
            return "Dialog handlers patched";
        })()
        `;
        return await wv.executeJavaScript(script);
    },

    // --- 9. Key press (with delay) ---
    async webviewPressKey(keyCombo, uid) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        wv.focus();

        // 1. Obtain element coordinates from JavaScript
        const rectScript = `
        (function() {
            const el = document.querySelector('[data-ai-id="${uid}"]');
            if (!el) return null;
            
            // Scroll to the center of the screen
            el.scrollIntoView({behavior: "auto", block: "center", inline: "center"});
            
            // Obtain precise viewport-relative coordinates
            const rect = el.getBoundingClientRect();
            return {
                x: rect.left + (rect.width / 2),
                y: rect.top + (rect.height / 2)
            };
        })()
        `;

        try {
            const rect = await wv.executeJavaScript(rectScript);
            if (!rect) return "Element not found: " + uid;

            // Use sendInputEvent to dispatch a native mouse click
            // This transfers focus to the input at those coordinates
            // x and y are relative to the top-left of the Webview
            
            // 1. Move and press the mouse
            wv.sendInputEvent({ 
                type: 'mouseDown', 
                x: rect.x, 
                y: rect.y, 
                button: 'left', 
                clickCount: 1 
            });
            
            // 2. Release the mouse to complete the click
            wv.sendInputEvent({ 
                type: 'mouseUp', 
                x: rect.x, 
                y: rect.y, 
                button: 'left', 
                clickCount: 1 
            });

            // Wait for focus and cursor activation
            await new Promise(r => setTimeout(r, 400));

            // 3. Handle the key
            const parts = keyCombo.split('+').map(k => k.trim());
            let key = parts.pop(); 
            const modifiers = parts.map(m => m.toLowerCase());
            
            if (key.toLowerCase() === 'enter') key = 'Enter';

            // 4. Send native key events
            // Simulate keydown
            wv.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers });
            
            // Enter often requires a char event with character code 13 (\r)
            // Some older pages and React wrappers rely on this event for submission
            if (key === 'Enter') {
                wv.sendInputEvent({ type: 'char', keyCode: '\r', modifiers });
            } else if (key.length === 1) {
                wv.sendInputEvent({ type: 'char', keyCode: key, modifiers });
            }

            // Simulate a brief key hold
            await new Promise(r => setTimeout(r, Math.floor(Math.random() * 50) + 30));

            // Simulate keyup
            wv.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers });
            
            await this._humanDelay();
            
            return "Pressed (Native) " + keyCombo + " on " + uid;
        } catch (e) {
            return "PressKey Error: " + e.message;
        }
    },

    // --- 10. Wait for text (polling, no delay) ---
    async webviewWaitFor(text, timeout) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        
        const script = `
        (function() {
            return new Promise((resolve) => {
                const start = Date.now();
                const check = () => {
                    // 1. Check whether the text exists
                    if (document.body.innerText.includes(${JSON.stringify(text)})) {
                        resolve("Found: " + ${JSON.stringify(text)});
                    } 
                    // 2. Check timeout
                    else if (Date.now() - start > ${timeout}) {
                        // 3. Check page load status after timeout
                        if (document.readyState === 'complete') {
                            // Page loaded, but text not found
                            resolve("Page loaded");
                        } else {
                            // Page is still loading at timeout
                            resolve("Timeout waiting for text");
                        }
                    } 
                    // 4. Continue polling
                    else {
                        setTimeout(check, 100);
                    }
                };
                check();
            });
        })()
        `;
        return await wv.executeJavaScript(script);
    },

    // --- 11. Screenshot (no delay) ---
    async captureWebviewScreenshot(fullPage = false, uid = null) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        wv.focus();
        try {
            // 1. Scroll if an element is specified
            if (uid) {
                await this.webviewClick(uid);
                await this._humanDelay();
            }

            // 2. Capture page
            const image = await wv.capturePage();

            // 3. Resize to 1280 pixels wide to reduce image token usage
            const size = image.getSize();
            let resized = image;
            if (size.width > 1280) {
                resized = image.resize({ width: 1280 });
            }

            // 4. Convert to JPEG buffer (quality 70)
            const buffer = resized.toJPEG(70);

            // 5. Ask the main process to save the file
            // IPC buffer transfer is faster than Base64 string transfer
            const filename = await window.electronAPI.saveScreenshotDirect(buffer);
            
            // 6. Construct URL
            // window.electron.server.port is the backend port exposed by preload
            const host = window.electron.server.host || '127.0.0.1';
            const port = window.electron.server.port || 3456;
            
            const fileUrl = `http://${host}:${port}/uploaded_files/${filename}`;
            
            return fileUrl;

        } catch (e) {
            return "Screenshot Error: " + e.message;
        }
    },
    
    // --- 12. General JavaScript execution (with delay) ---
    async executeInActiveWebview(codeStr, args = []) {
        const wv = this.getWebview();
        if (!wv) return "Error: No active webview";
        wv.focus();
        try {
            const script = `(${codeStr})(...${JSON.stringify(args || [])})`;
            const result = await wv.executeJavaScript(script);
            
            // Wait after custom script execution to avoid high-frequency calls
            await this._humanDelay();

            if (result === undefined) return "undefined";
            if (result === null) return "null";
            if (typeof result === 'object') return JSON.stringify(result);
            return String(result);

        } catch (e) {
            return "JS Execution Error: " + e.message;
        }
    },
    getFaviconUrl(tab) {
      // 1. Use the favicon supplied by the browser
      if (tab.favicon) return tab.favicon;

      // 2. Use Chrome's built-in favicon API
      // This API reads the cache without additional permissions or network requests
      if (chrome && chrome.tabs && typeof chrome.tabs.get === 'function') {
        // Read cache synchronously; ignore missing entries
        try {
          const url = new URL(tab.url);
          return `chrome://favicon/size/16@2x/${url.origin}`;
        } catch (_) {}
      }

      // 3. Fallback: construct the likely favicon URL
      try {
        const u = new URL(tab.url);
        return `${u.origin}/favicon.ico`;
      } catch (_) {}

      // 4. Return an empty string if unavailable
      return '';
    },

    // Toggle bookmark for the current tab
    toggleFavorite(tab) {
        if (!tab || !tab.url) return;

        const index = this.favorites.findIndex(f => f.url === tab.url);
        if (index !== -1) {
            // Existing bookmark: remove
            this.favorites.splice(index, 1);
            showNotification(this.t('favoriteRemoved') || 'Favorite removed', 'info');
        } else {
            // No bookmark: add
            this.favorites.push({
                title: tab.title || 'New Tab',
                url: tab.url,
                favicon: this.getFaviconUrl(tab)
            });
            showNotification(this.t('favoriteAdded') || 'Favorite added', 'success');
        }
        this.saveFavorites();
    },

    // Remove a specific bookmark from the grid
    removeFavorite(url) {
        const index = this.favorites.findIndex(f => f.url === url);
        if (index !== -1) {
            this.favorites.splice(index, 1);
            this.saveFavorites();
        }
    },

    // Load bookmark URL in the current tab
    loadUrlInCurrentTab(url) {
        if (this.currentTab) {
            // Update current tab URL
            this.currentTab.url = url;
            // Update address bar display
            this.urlInput = url; 
            // Trigger loading state if required by the Webview
            this.currentTab.isLoading = true;
        } else {
            // Create a tab if none is active
            this.addNewTab(url);
        }
    },

    // Persistence: save bookmarks to local storage
    saveFavorites() {
        try {
            localStorage.setItem('browser_favorites', JSON.stringify(this.favorites));
            // Save visibility preference
            localStorage.setItem('browser_show_favorites', JSON.stringify(this.showFavorites));
        } catch (e) {
            console.error('Failed to save favorites:', e);
        }
    },

    // Persistence: load from local storage
    loadFavorites() {
        try {
            const storedFavs = localStorage.getItem('browser_favorites');
            if (storedFavs) {
                this.favorites = JSON.parse(storedFavs);
            }
            
            const storedShow = localStorage.getItem('browser_show_favorites');
            if (storedShow !== null) {
                this.showFavorites = JSON.parse(storedShow);
            }
        } catch (e) {
            console.error('Failed to load favorites:', e);
        }
    },

    openBrainEdit(brainKey) {
      this.currentEditingKey = brainKey;
      this.showBrainEditDialog = true;
    },
    handleFirecrawlPresetChange(val) {
      if (val === 'official') {
        this.webSearchSettings.firecrawl_url = 'https://api.firecrawl.dev/v2';
      } else {
        this.webSearchSettings.firecrawl_url = 'http://localhost:3002/v1';
      }
      this.autoSaveSettings();
    },

// Methods

// 1. Fetch skills
async fetchSkills() {
  try {
    const response = await fetch('/api/skills/list');
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    const data = await response.json();
    this.skillsList = data.skills;
  } catch (error) {
    showNotification(this.t('fetchSkillsFailed'), 'error');
  }
},

// 2. Delete skill
async removeSkill(id) {
  try {
    const response = await fetch(`/api/skills/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error('Delete failed');
    }
    
    showNotification(this.t('deleteSuccess'), 'success');
    this.fetchSkills(); // Refresh
  } catch (error) {
    showNotification(this.t('deleteFailed'), 'error');
  }
},

// 3. Install from GitHub
async installSkillFromGithub() {
  if (!this.newSkillUrl) return;
  this.isSkillInstalling = true;
  showNotification(this.t('waitSkillInstall'), 'success');
  try {
    const response = await fetch('/api/skills/install-from-github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: this.newSkillUrl
      })
    });

    if (!response.ok) {
      // Parse JSON error returned by backend
      const errorData = await response.json().catch(() => ({})); 
      const errorMessage = errorData.detail || response.statusText || 'Unknown Error';
      throw new Error(errorMessage);
    }

    showNotification(this.t('installSuccess'), 'success');
    this.showAddSkillDialog = false;
    this.newSkillUrl = '';
    // Refresh after a short delay to allow the background task to complete
    setTimeout(() => this.fetchSkills(), 2000);
  } catch (error) {
    showNotification(this.t('installFailed') + ': ' + error.message, 'error');
  } finally {
    this.isSkillInstalling = false;
  }
},

// 4. Clicking the DIV activates the hidden input
triggerSkillFileSelect() {
  // For Vue 3 script setup, use const skillFileInput = ref(null) and skillFileInput.value.click()
  // For Options API (export default):
  this.$refs.skillFileInput.click();
},

// 5. Handle file selection changes
handleSkillFileChange(e) {
  const files = e.target.files;
  if (files && files.length > 0) {
    this.processSkillUpload(files[0]);
  }
  // Clear input so selecting the same file again triggers change
  e.target.value = ''; 
},

// 6. Handle dropped files
handleSkillDrop(e) {
  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    this.processSkillUpload(files[0]);
  }
},

// 7. Shared upload logic
async processSkillUpload(file) {
  // Validate file type
  if (!file.name.toLowerCase().endsWith('.zip')) {
    // Use showNotification instead of ElMessage.error
    showNotification(this.t('skillZipNote'), 'error'); 
    return;
  }

  this.isUploading = true; // Show loading overlay

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/skills/upload-zip', {
      method: 'POST',
      body: formData
      // Do not manually set Content-Type when sending FormData with fetch
      // The browser sets the multipart/form-data boundary automatically
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || this.t('installFailed'));
    }

    showNotification(this.t('installSuccess'), 'success');
    this.showAddSkillDialog = false;
    this.fetchSkills(); // Refresh list
  } catch (error) {
    showNotification(error.message, 'error');
  } finally {
    this.isUploading = false; // Hide loading overlay
  }
},

isSkillInProject(skillId) {
  return this.skillsInProject && this.skillsInProject.includes(skillId);
},

    // 1. Fetch project status and retain details
    async fetchProjectSkillsStatus() {
      if (!this.CLISettings.cc_path) {
        this.skillsInProject = [];
        this.projectSkillsDetails = [];
        return;
      }
      try {
        const res = await fetch(`/api/skills/project-status?path=${encodeURIComponent(this.CLISettings.cc_path)}`);
        if (res.ok) {
          const data = await res.json();
          this.skillsInProject = data.installed_ids || [];
          this.projectSkillsDetails = data.project_skills || []; // Store details
        }
      } catch (e) {
        console.error("Failed to fetch project skill status", e);
      }
    },

    // 2. Reverse sync: project to global
    async syncToGlobal(skillId) {
      try {
        const response = await fetch('/api/skills/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skill_id: skillId, project_path: this.CLISettings.cc_path, action: 'sync_to_global' })
        });
        const data = await response.json();
        if (response.ok && data.status === 'success') {
          showNotification('Skill synced to Global', 'success');
          this.fetchSkills(); // Refresh global status
        } else {
          throw new Error(data.detail || 'Sync failed');
        }
      } catch (e) {
        showNotification(e.message, 'error');
      }
    },

    // 3. Forward sync: global to project
    async syncToProject(skillId) {
      if (!this.CLISettings.cc_path) return;
      try {
        const response = await fetch('/api/skills/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skill_id: skillId, project_path: this.CLISettings.cc_path, action: 'install' })
        });
        if (response.ok) {
          showNotification('Skill synced to Workspace', 'success');
          this.fetchProjectSkillsStatus(); // Refresh project status
        } else {
          throw new Error('Sync failed');
        }
      } catch (e) {
        showNotification(e.message, 'error');
      }
    },

    // 4. Delete globally with appropriate warning
    async removeGlobalSkill(skill) {
      const execDelete = async () => {
        try {
          const response = await fetch(`/api/skills/${encodeURIComponent(skill.id)}`, { method: 'DELETE' });
          if (response.ok) {
            showNotification('Removed globally', 'success');
            await this.fetchSkills(); 
          } else {
            throw new Error('Remove failed');
          }
        } catch (e) {
          showNotification(e.message, 'error');
        }
      };

      // Warn if the skill is also absent from the project; this is a complete deletion
      if (!skill.isProject) {
        this.$confirm(this.t('deleteSkillConfirm'), this.t('warning'), { type: 'warning' })
          .then(execDelete).catch(() => {});
      } else {
        // If the project retains a copy, delete silently
        execDelete();
      }
    },

    // 5. Delete from project with appropriate warning
    async removeProjectSkill(skill) {
      const execDelete = async () => {
        try {
          const response = await fetch('/api/skills/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skill_id: skill.id, project_path: this.CLISettings.cc_path, action: 'remove' })
          });
          if (response.ok) {
            showNotification('Removed from Workspace', 'success');
            await this.fetchProjectSkillsStatus(); 
          } else {
            throw new Error('Remove failed');
          }
        } catch (e) {
          showNotification(e.message, 'error');
        }
      };

      // Warn if the skill is also absent globally; this is a complete deletion
      if (!skill.isGlobal) {
        this.$confirm('This will permanently delete the skill file. Continue?', 'Warning', { type: 'warning' })
          .then(execDelete).catch(() => {});
      } else {
        // If the global copy remains, delete silently
        execDelete();
      }
    },

// Toggle skill synchronization
async toggleSkillInProject(skillId, isInstall) {
  if (!this.CLISettings.cc_path) return;

  const action = isInstall ? 'install' : 'remove';
  try {
    const response = await fetch('/api/skills/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skill_id: skillId,
        project_path: this.CLISettings.cc_path,
        action: action
      })
    });

    if (!response.ok) throw new Error('Sync failed');

    // Update local status list
    if (isInstall) {
      if (!this.skillsInProject.includes(skillId)) this.skillsInProject.push(skillId);
    } else {
      this.skillsInProject = this.skillsInProject.filter(id => id !== skillId);
    }
    
    showNotification(this.t('operationSuccess'), 'success');
  } catch (error) {
    showNotification(this.t('operationFailed'), 'error');
    // Refresh status to revert the UI toggle
    this.fetchProjectSkillsStatus();
  }
},

// --- Extended watchers and initialization ---

// Refresh project status when entering the skills tab
handleSkillsPolling(activeMenu, menu, tab) {
  if (activeMenu === 'toolkit' && menu === 'CLI' && tab === 'skills') {
    this.fetchProjectSkillsStatus(); // Also fetch project skill status
    this.startSkillsPolling();
  } else {
    this.stopSkillsPolling();
  }
},

  // Start polling
  startSkillsPolling() {
    if (this.skillsPollingTimer) return; // Do not start a duplicate polling timer
    
    // Run immediately rather than waiting five seconds
    this.fetchSkills(); 

    // Run every five seconds
    this.skillsPollingTimer = setInterval(() => {
      console.log('Polling skills...');
      this.fetchSkills();
    }, 5000);
  },

  // Stop polling
  stopSkillsPolling() {
    if (this.skillsPollingTimer) {
      clearInterval(this.skillsPollingTimer);
      this.skillsPollingTimer = null;
      console.log('Skills polling stopped');
    }
  },
// Control polling for the extensions page
  handleExtensionsPolling(menu, sub) {
    if (menu === 'api-group' && sub === 'extension') {
      this.startExtensionsPolling();
    } else {
      this.stopExtensionsPolling();
    }
  },

  // Start extension polling
  startExtensionsPolling() {
    if (this.extensionsPollingTimer) return;
    
    // Refresh immediately
    this.scanExtensions(); 

    this.extensionsPollingTimer = setInterval(() => {
      console.log('Polling extensions...');
      this.scanExtensions();
    }, 5000);
  },

  // Stop extension polling
  stopExtensionsPolling() {
    if (this.extensionsPollingTimer) {
      clearInterval(this.extensionsPollingTimer);
      this.extensionsPollingTimer = null;
      console.log('Extension polling stopped');
    }
  },

  // Refresh extensions and compare versions
  async scanExtensions() {
    try {
      const response = await fetch('/api/extensions/list');
      if (!response.ok) throw new Error('Fetch failed');
      const data = await response.json();
      this.extensions = data.extensions;
      
      // Synchronize local and remote installed/update status
      this.syncExtensionUpdateStatus();
    } catch (e) {
      console.error('Failed to refresh extensions', e);
    }
  },
  
  // Helper: compare local and remote versions and synchronize status
  syncExtensionUpdateStatus() {
    if (!this.extensions || !this.remotePlugins) return;

    // 1. Mark installed and hasUpdate on remote items
    this.remotePlugins = this.remotePlugins.map(r => {
      const local = this.extensions.find(l => 
          (l.repository && r.repository && l.repository.trim().toLowerCase() === r.repository.trim().toLowerCase()) || 
          (l.id && r.id && l.id === r.id)
      );
      let installed = !!local;
      let hasUpdate = false;
      
      if (local && local.version && r.version) {
        if (this.compareVersions(local.version, r.version) < 0) {
          hasUpdate = true;
        }
      }
      return { ...r, installed, hasUpdate };
    });

    // 2. Mark hasUpdate on local items
    this.extensions = this.extensions.map(l => {
      const remote = this.remotePlugins.find(r => 
          (l.repository && r.repository && l.repository.trim().toLowerCase() === r.repository.trim().toLowerCase()) || 
          (l.id && r.id && l.id === r.id)
      );
      let hasUpdate = false;
      if (remote && l.version && remote.version) {
        if (this.compareVersions(l.version, remote.version) < 0) {
          hasUpdate = true;
        }
      }
      return { ...l, hasUpdate };
    });
  },

  // Helper: compare semantic versions
  compareVersions(v1, v2) {
    if (!v1 || !v2) return 0;
    const parts1 = v1.toString().replace(/[^0-9.]/g, '').split('.').map(Number);
    const parts2 = v2.toString().replace(/[^0-9.]/g, '').split('.').map(Number);
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const num1 = parts1[i] || 0;
      const num2 = parts2[i] || 0;
      if (num1 < num2) return -1;
      if (num1 > num2) return 1;
    }
    return 0;
  },
// Preview skill
async previewSkill(id) {
  this.showSkillPreviewDialog = true;
  this.skillPreviewLoading = true;
  this.renderedSkillContent = '';

  try {
    const response = await fetch(`/api/skills/${id}/content`);
    if (!response.ok) throw new Error('Fetch failed');
    const data = await response.json();
    let rawContent = data.content || '';

    // 1. Strip YAML frontmatter (--- ... ---)
    // Hide redundant metadata in preview
    const yamlRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?/;
    const contentToRender = rawContent.replace(yamlRegex, '');

    // 2. Render using existing md instance
    // Call md.render directly
    // To match chat rendering, including LaTeX and think tags,
    // call this.formatMessage(contentToRender)
    this.renderedSkillContent = this.formatMessage(contentToRender);

  } catch (error) {
    showNotification(this.t('fetchFailed'), 'error');
    this.showSkillPreviewDialog = false;
  } finally {
    this.skillPreviewLoading = false;
  }
},

  handleRemoteMCPInstall(data) {
    console.log('handleRemoteMCPInstall', data);

    // 1. Switch route/menu to MCP management
    this.activeMenu = 'toolkit'; 
    this.subMenu = 'mcp';

    // 2. Initialize dialog in add mode
    this.isEditMode = false;
    this.activeDialogTab = 'config'; // Show configuration tab by default
    
    if (data.mcpType) {
        this.newMCPType = data.mcpType;
    } else {
        this.newMCPType = 'stdio'; // Default value
    }

    // 3. Set JSON input mode for complete remote configuration objects
    this.mcpInputType = 'json';
    this.updateMCPExample(); // Update example configuration
    // data now contains { type: 'mcp', config: '...', repo: null }
    let configStr = data.config;
    
    // 1. Decode the original URL parameter received from main process if needed
    try {
      configStr = decodeURIComponent(configStr);
    } catch(e) {}

    this.newMCPJson = configStr; // Populate input
    this.showAddMCPDialog = true; // Open dialog
  },
// Add to methods
async openSkillsFolder() {
  try {
    const response = await fetch('/api/skills/get_path', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    if (response.ok) {
      const data = await response.json();
      if (this.isElectron && data.path) {
        // Call Electron API to open local path
        window.electronAPI.openPath(data.path);
      }
    }
  } catch (error) {
    console.error("Failed to open skills folder:", error);
  }
},

async handleRefreshSkills() {
  this.skillsLoading = true;
  try {
    // Use fetchSkills to retrieve the list
    await this.fetchSkills(); 
  } finally {
    this.skillsLoading = false;
  }
},

    // Open edit/add dialog
    openBehaviorDialog(index) {
      this.currentBehaviorIndex = index;
      if (index === -1) {
        // Add mode: deep copy default template
        this.tempBehavior = this.createDefaultBehavior();
      } else {
        // Edit mode: deep copy current data to break references
        // Data is stored in behaviorSettings.behaviorList
        this.tempBehavior = JSON.parse(JSON.stringify(this.behaviorSettings.behaviorList[index]));
      }
      
      this.showBehaviorDialog = true;
    },

    // Create default behavior template
    createDefaultBehavior() {
      return {
        enabled: true,
        trigger: {
          type: 'time',
          time: { timeValue: '08:00:00', days: [1, 2, 3, 4, 5] },
          noInput: { latency: 60 },
          cycle: { cycleValue: '00:30:00', repeatNumber: 1, isInfiniteLoop: true }
        },
        action: {
          type: 'prompt',
          prompt: '',
          random: { type: 'random', events: [''] }
        },
        platforms: ["chat"],  // Multi-select channel field (array of strings)
      };
    },

    // Clean up after dialog closes
    resetBehaviorDialogState() {
      this.tempBehavior = null;
      this.currentBehaviorIndex = -1;
    },

    // Save behavior (add or update)
    saveBehavior() {
      if (!this.tempBehavior) return;

      // 1. Ensure platforms is a nonempty array
      if (!Array.isArray(this.tempBehavior.platforms)) {
        // Convert legacy single-select field or use default
        let oldVal = this.tempBehavior.platform || 'chat';
        this.tempBehavior.platforms = [oldVal];
      }
      
      // Use chat if the user selected no channels
      if (this.tempBehavior.platforms.length === 0) {
        this.tempBehavior.platforms = ['chat'];
      }

      // 2. Synchronize legacy platform field to first array item
      this.tempBehavior.platform = this.tempBehavior.platforms[0];

      // 3. Save
      if (this.isEditingBehavior) {
        // Find and replace existing item
        const idx = this.behaviorSettings.behaviorList.findIndex(b => b === this.editingItemOrigin);
        if (idx !== -1) {
          this.behaviorSettings.behaviorList[idx] = JSON.parse(JSON.stringify(this.tempBehavior));
        }
      } else {
        // Add new item
        this.behaviorSettings.behaviorList.push(JSON.parse(JSON.stringify(this.tempBehavior)));
      }

      this.showBehaviorDialog = false;
      
      // 4. Refresh timers after saving
      this.$nextTick(() => {
        this.resetCycleTimers();
      });
    },

    // Confirm behavior deletion
    confirmRemoveBehavior(index) {
      this.$confirm(
        this.t('confirmDeleteBehavior') || 'Are you sure you want to delete this behavior?',
        this.t('warning') || 'Warning',
        {
          confirmButtonText: this.t('confirm'),
          cancelButtonText: this.t('cancel'),
          type: 'warning',
        }
      ).then(() => {
        this.removeBehavior(index);
      }).catch(() => {});
    },

    // Delete
    removeBehavior(index) {
      this.behaviorSettings.behaviorList.splice(index, 1);
      this.resetCycleTimers();
      this.autoSaveSettings();
    },

    // Handle global toggle change
    handleGlobalSwitchChange() {
      this.resetCycleTimers();
      this.autoSaveSettings();
    },

    // Handle individual behavior toggle change
    handleBehaviorChange() {
      this.resetCycleTimers();
      this.autoSaveSettings();
    },

    // --- Dialog helpers (Random Events) ---

    // Add temporary random event
    addTempEvent() {
      if (this.tempBehavior && this.tempBehavior.action.random) {
        this.tempBehavior.action.random.events.push('');
      }
    },

    // Remove temporary random event
    removeTempEvent(eIdx) {
      if (this.tempBehavior && 
          this.tempBehavior.action.random && 
          this.tempBehavior.action.random.events.length > 1) {
        this.tempBehavior.action.random.events.splice(eIdx, 1);
      }
    },

    // --- UI display helpers ---

    // Return icon class for trigger type
    getTriggerIcon(type) {
      const map = {
        'time': 'fa-regular fa-clock',
        'noInput': 'fa-solid fa-hourglass-half',
        'cycle': 'fa-solid fa-arrows-spin'
      };
      return map[type] || 'fa-solid fa-bolt';
    },

    // Generate card summary
    getBehaviorSummary(b) {
      if (!b || !b.trigger) return '';
      
      if (b.trigger.type === 'time') {
        const time = b.trigger.time.timeValue;
        const days = b.trigger.time.days.length;
        const daysText = this.t('repeatDays') || 'Days'; // Use translation function for label
        return `${time} (${daysText}: ${days})`;
      } else if (b.trigger.type === 'noInput') {
        return `${this.t('noInputLatency') || 'Latency'}: ${b.trigger.noInput.latency}s`;
      } else if (b.trigger.type === 'cycle') {
        const loopText = b.trigger.cycle.isInfiniteLoop ? '∞' : b.trigger.cycle.repeatNumber;
        return `${this.t('cycleValue') || 'Cycle'}: ${b.trigger.cycle.cycleValue} (x${loopText})`;
      }
      return '';
    },
  // Add event row
  addTempEvent() {
    if (this.tempBehavior && this.tempBehavior.action.random) {
      this.tempBehavior.action.random.events.push(''); // Append an empty string for a new input
    }
  },

  // Remove specified row
  removeTempEvent(index) {
    if (this.tempBehavior && this.tempBehavior.action.random) {
      // Keep at least one row; remove this guard to allow an empty list
      if (this.tempBehavior.action.random.events.length > 1) {
        this.tempBehavior.action.random.events.splice(index, 1);
      } else {
        // Clear the last row instead of removing it
        this.tempBehavior.action.random.events[0] = '';
      }
    }
  },

    // Helper: generate a numeric range
    makeRange(start, end) {
      const result = [];
      for (let i = start; i <= end; i++) {
        result.push(i);
      }
      return result;
    },

    // Disabled hours
    disabledHours() {
      // Disable hours only if the minimum hour exceeds zero
      // For a minimum of 00:00:01, no hours are disabled
      return this.makeRange(0, 23).filter(h => h < this.minLimit.h);
    },

    // Disabled minutes (selectedHour is the selected hour)
    disabledMinutes(selectedHour) {
      // Restrict minutes only when selectedHour equals the minimum hour
      if (selectedHour === this.minLimit.h) {
        return this.makeRange(0, 59).filter(m => m < this.minLimit.m);
      }
      return [];
    },

    // Disabled seconds (selectedHour and selectedMinute are the selected hour and minute)
    disabledSeconds(selectedHour, selectedMinute) {
      // Restrict seconds only when both hour and minute are at their minimum
      if (selectedHour === this.minLimit.h && selectedMinute === this.minLimit.m) {
        return this.makeRange(0, 59).filter(s => s < this.minLimit.s);
      }
      return [];
    },

    async probeDocker() {
      try {
        const res = await fetch('/api/docker/probe');
        const data = await res.json();
        this.dockerInstalled = data.installed;
      } catch (error) {
        console.error("Docker detection failed:", error);
        this.dockerInstalled = false;
      }
    },

    // Open task center
    openTaskCenter() {
        this.activeSideView = 'tasks';
        this.sidePanelURL = ''; // Ensure iframe is closed
        this.currentExtension = null;
        this.showExtensionsDialog = false; // Close dialog
        this.expandSidePanel();
        this.fetchTasks();
        // Start polling
        if (this.taskRefreshTimer) clearInterval(this.taskRefreshTimer);
        this.taskRefreshTimer = setInterval(this.fetchTasks, 3000);
    },
    openWorkspace() {
        this.activeSideView = 'workspace'
        this.sidePanelURL = ''; // Ensure iframe is closed
        this.currentExtension = null;
        this.showExtensionsDialog = false; // Close dialog
        this.expandSidePanel();
    },
    // Close task center and return to list
    closeTaskCenter() {
        this.activeSideView = 'list';
        if (this.taskRefreshTimer) clearInterval(this.taskRefreshTimer);
    },

    // Fetch tasks
    async fetchTasks() {
        if (!this.hasWorkspacePath || !this.sidePanelOpen || this.activeSideView !== 'tasks') return;
        
        try {
            const res = await fetch(`/v1/tasks/list`);
            const data = await res.json();
            if (data.tasks) {
                this.taskList = data.tasks;
            }
        } catch (e) {
            console.error("Failed to fetch tasks", e);
        }
    },

    // Create task
    async submitCreateTask() {
        if (!this.newTaskForm.title || !this.newTaskForm.description) {
            showNotification(this.t('fillRequired'), 'error');
            return;
        }

        this.isCreatingTask = true;
        try {
            console.log(this.newTaskForm); // Log form data
            const res = await fetch(`/v1/tasks/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: this.newTaskForm.title,
                    description: this.newTaskForm.description,
                    agent_type: this.newTaskForm.agent_type,
                    task_type: this.newTaskForm.task_type,
                    platforms: this.newTaskForm.platforms,
                    trigger_config: this.newTaskForm.trigger_config // Send complete configuration
                })
            });
            const data = await res.json();
            
            if (data.success) {
                showNotification(this.t('success'));
                this.showCreateTaskDialog = false;
                // Reset form
                this.newTaskForm = { 
                    title: '', description: '', task_type: 'once', agent_type: 'default',
                    trigger_config: { timeValue: '09:00:00', days: [1,2,3,4,5], cycleValue: '01:00:00', repeatNumber: 1, isInfiniteLoop: true }
                };
                this.fetchTasks();
            } else {
                showNotification(data.error, 'error');
            }
        } catch (e) {
            showNotification(this.t('networkError'), 'error');
        } finally {
            this.isCreatingTask = false;
        }
    },


    // Cancel task
    async handleCancelTask(taskId) {
        try {
            await fetch(`/v1/tasks/cancel/${taskId}`, { method: 'POST' });
            showNotification(this.t('cancelSuccess') || 'Task cancelled');
            this.fetchTasks();
        } catch (e) { console.error(e); }
    },

    // Delete task
    async handleDeleteTask(taskId) {
        try {
            this.handleCancelTask(taskId);
            const res = await fetch(`/v1/tasks/${taskId}`, { 
                method: 'DELETE' 
            });
            
            if (res.ok) {
                showNotification(this.t('deleteSuccess') || 'Task deleted');
                this.fetchTasks(); // Refresh list
            } else {
                console.error("Delete failed with status:", res.status);
            }
        } catch (e) { 
            console.error("Network error during delete:", e); 
        }
    },

    // Navigate to settings
    jumpToCLIConfig() {
        this.activeMenu = 'toolkit';
        this.subMenu = 'CLI';
    },

    formatTaskTime(isoStr) {
        if (!isoStr) return '-';
        const date = new Date(isoStr);
        return date.toLocaleString();
    },

    getTaskStatusType(status) {
        const map = {
            'pending': 'info',
            'running': 'primary',
            'completed': 'success',
            'failed': 'danger',
            'cancelled': 'warning'
        };
        return map[status] || 'info';
    },
  // Open task result dialog
// In Vue component methods
openTaskResult(task) {
    this.selectedTaskTitle = task.title;
    
    // 1. Retrieve task output history
    // For legacy tasks without history, create a record containing the current result
    const rawHistory = task.context?.results_history || [];
    
    if (rawHistory.length === 0 && task.result) {
        this.selectedTaskHistory = [{
            time: task.updated_at || task.created_at,
            result: task.result
        }];
    } else {
        // Sort history in reverse chronological order
        this.selectedTaskHistory = [...rawHistory].reverse();
    }
    
    // 2. Select newest record by default
    this.currentResultIdx = 0;
    
    // 3. Open dialog
    this.showTaskResultDialog = true;
},
    
    getModeIcon(type) {
        const iconMap = {
            'once': 'fa-solid fa-bolt-lightning',
            'time': 'fa-regular fa-clock',
            'cycle': 'fa-solid fa-arrows-rotate'
        };
        // Return default icon if type is empty or unknown
        return iconMap[type] || 'fa-solid fa-terminal';
    },


    // Reset form to initial state
    resetTaskForm() {
        this.newTaskForm = {
            title: '',
            description: '',
            task_type: 'once',
            platforms: [],
            agent_type: 'default',
            trigger_config: {
                timeValue: '09:00:00',
                days: [1, 2, 3, 4, 5],
                cycleValue: '01:00:00',
                repeatNumber: 1,
                isInfiniteLoop: true
            }
        };
        this.isEditing = false;
        this.editingTaskId = null;
    },

    // Open create dialog
    openCreateTaskDialog() {
        this.resetTaskForm(); // Reset before creating each task
        this.showCreateTaskDialog = true;
    },

    openEditTaskDialog(task) {
        // 1. Reset previous state
        this.resetTaskForm();
        
        // 2. Mark edit mode
        this.isEditing = true;
        this.editingTaskId = task.task_id;
        
        // 3. Populate basic data
        this.newTaskForm.title = task.title;
        this.newTaskForm.description = task.description;
        this.newTaskForm.platforms = task.platforms || [];
        this.newTaskForm.agent_type = task.agent_type || 'default';
        this.newTaskForm.task_type = task.context?.task_type || task.task_type || 'once';
        
        // 4. Populate trigger configuration
        const savedConfig = task.context?.trigger_config;
        if (savedConfig) {
            // Use assign or spread to retain reactivity
            Object.assign(this.newTaskForm.trigger_config, JSON.parse(JSON.stringify(savedConfig)));
        }
        
        this.showCreateTaskDialog = true;
    },

    // 2. Shared submission handler
    async submitTaskForm() {
        if (!this.newTaskForm.title || !this.newTaskForm.description) {
            showNotification(this.t('fillRequired'), 'error');
            return;
        }

        this.isCreatingTask = true;

        try {
            // In edit mode, stop and delete the previous task first
            if (this.isEditing && this.editingTaskId) {
                // A. Stop existing task
                await fetch(`/v1/tasks/cancel/${this.editingTaskId}`, { method: 'POST' });
                // B. Delete existing task
                await fetch(`/v1/tasks/${this.editingTaskId}`, { method: 'DELETE' });
                console.log(`Old task ${this.editingTaskId} removed for re-creation`);
            }

            // C. Create task through the same endpoint for both new and edited tasks
            const res = await fetch(`/v1/tasks/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.newTaskForm)
            });
            const data = await res.json();
            
            if (data.success) {
                showNotification(this.t('success'));
                this.showCreateTaskDialog = false; // Close dialog
                this.resetTaskForm();             // Reset form after successful submission
                this.fetchTasks();                // Refresh list
            } else {
                showNotification(data.error, 'error');
            }
        } catch (e) {
            showNotification(this.t('networkError'), 'error');
        } finally {
            this.isCreatingTask = false;
            // Reset edit state after submission
            this.isEditing = false;
            this.editingTaskId = null;
        }
    },

    // 3. Reset is called when the dialog closes (el-dialog @closed)
    resetTaskForm() {
        this.isEditing = false;
        this.editingTaskId = null;
        this.newTaskForm = {
            title: '', description: '', task_type: 'once', agent_type: 'default',
            trigger_config: { timeValue: '09:00:00', days: [1,2,3,4,5], cycleValue: '01:00:00', repeatNumber: 1, isInfiniteLoop: true }
        };
    },
// Open details
openTaskDetailView(task) {
    this.viewingTaskDetail = task;
},

// Close details and return to list
closeTaskDetail() {
    this.viewingTaskDetail = null;
},

// Fetch tasks and synchronize details
async fetchTasks() {
    if (!this.hasWorkspacePath || !this.sidePanelOpen || this.activeSideView !== 'tasks') return;
    
    try {
        const res = await fetch(`/v1/tasks/list`);
        const data = await res.json();
        if (data.tasks) {
            this.taskList = data.tasks;
            
            // Update the task details currently being viewed
            if (this.viewingTaskDetail) {
                const updatedTask = data.tasks.find(t => t.task_id === this.viewingTaskDetail.task_id);
                if (updatedTask) {
                    this.viewingTaskDetail = updatedTask;
                }
            }
        }
    } catch (e) {
        console.error("Failed to fetch tasks", e);
    }
},

// Reset task center when closed
closeTaskCenter() {
    this.activeSideView = 'list';
    this.viewingTaskDetail = null; // Clear detail state
    if (this.taskRefreshTimer) clearInterval(this.taskRefreshTimer);
},

  // Handle enable switch
  handleEnableToggle(newValue) {
    // Validate only when the user enables the switch (newValue === true)
    if (newValue === true) {
      // Check whether cc_path is empty
      if (!this.CLISettings.cc_path || this.CLISettings.cc_path.trim() === '') {
        
        // 1. Show error
        // Use the existing pleaseSelectWorkspaceFirst translation
        const errorMsg = this.t ? this.t('pleaseSelectWorkspaceFirst') : 'Configure the workspace path first';
        showNotification(errorMsg, 'error', 'Error');

        // 2. Reset switch to off to prevent startup
        // Use $nextTick to ensure Vue updates the DOM
        this.$nextTick(() => {
          this.CLISettings.enabled = false;
        });

        // 3. Navigate to CLI configuration to set workspace path
        this.jumpToCLIConfig();

        // 4. Return without saving
        return; 
      }
    }

    // Proceed with normal saving if validation passes or the switch is being disabled
    this.autoSaveSettings();
  },

  handleVisionControlEnableToggle(newValue){
    if (newValue === true && this.visionSettings.enabled === true) {
      this.visionSettings.enabled = false;
      showNotification(this.t('autoDisableVisionSettings'), 'warning');
    }
    this.autoSaveSettings();
  },
  handleVisionEnableToggle(newValue){
    if (newValue === true && this.visionControlSettings.enabled === true) {
      this.visionControlSettings.enabled = false;
      showNotification(this.t('autoDisableVisionControlSettings'), 'warning');
    }
    this.autoSaveSettings();
  },

  handleWebSearchToggle(newValue) {
    if (newValue === true) {
      const settings = this.webSearchSettings;
      let errorMsg = '';

      // --- 1. Validate search engine configuration ---
      switch (settings.engine) {
        case 'searxng':
          if (!settings.searxng_url?.trim()) errorMsg = this.t('pleaseConfigSearxngUrl');
          break;
        case 'tavily':
          if (!settings.tavily_api_key?.trim()) errorMsg = this.t('pleaseConfigTavilyApiKey');
          break;
        case 'google':
          if (!settings.google_api_key?.trim()) errorMsg = this.t('pleaseConfigGoogleApiKey');
          else if (!settings.google_cse_id?.trim()) errorMsg = this.t('pleaseConfigGoogleCseId');
          break;
        case 'brave':
          if (!settings.brave_api_key?.trim()) errorMsg = this.t('pleaseConfigBraveApiKey');
          break;
        case 'exa':
          if (!settings.exa_api_key?.trim()) errorMsg = this.t('pleaseConfigExaApiKey');
          break;
        case 'serper':
          if (!settings.serper_api_key?.trim()) errorMsg = this.t('pleaseConfigSerperApiKey');
          break;
        // DuckDuckGo requires no configuration
      }

      // --- 2. Validate page parser configuration after search engine validation ---
      if (!errorMsg) {
        switch (settings.crawler) {
          case 'crawl4ai':
            if (!settings.Crawl4Ai_url?.trim()) errorMsg = this.t('pleaseConfigCrawl4aiUrl');
            break;
          case 'firecrawl':
            if (!settings.firecrawl_url?.trim()) errorMsg = this.t('pleaseConfigFirecrawlUrl');
            // Uncomment the following line if a Firecrawl API key must be required:
            // else if (!settings.firecrawl_api_key?.trim()) errorMsg = this.t('pleaseConfigFirecrawlApiKey');
            break;
          
          // Jina API key is optional; no validation error is required
          // simpleRequest and mdnew have no required fields
        }
      }

      // --- 3. Block invalid configuration and report error ---
      if (errorMsg) {
        // Show localized error and title
        const errorTitle = this.t ? this.t('configIncomplete') : 'Config Incomplete';
        showNotification(errorMsg, 'error', errorTitle);

        // Reset switch to off
        this.$nextTick(() => {
          this.webSearchSettings.enabled = false;
        });

        // Return without saving
        return;
      }
    }

    // Save normally when validation passes or the user disables the switch
    this.autoSaveSettings();
  },

  // Validate code interpreter enable switch
  handleInterpreterToggle(newValue) {
    if (newValue === true) {
      const settings = this.codeSettings;
      let errorMsg = '';

      // Validate required fields for selected engine
      switch (settings.engine) {
        case 'e2b':
          if (!settings.e2b_api_key?.trim()) {
            errorMsg = this.t('pleaseConfigE2bApiKey');
          }
          break;
        case 'sandbox':
          if (!settings.sandbox_url?.trim()) {
            errorMsg = this.t('pleaseConfigSandboxUrl');
          }
          break;
      }

      // Block startup if an error exists
      if (errorMsg) {
        // Show error using configIncomplete
        const errorTitle = this.t ? this.t('configIncomplete') : 'Config Incomplete';
        showNotification(errorMsg, 'error', errorTitle);

        // Reset switch to off
        this.$nextTick(() => {
          this.codeSettings.enabled = false;
        });

        // Return without saving
        return;
      }
    }

    // Save normally if validation passes or switch is disabled
    this.autoSaveSettings();
  },
// 1. Lazy-load file directories
  async loadWorkspaceNode(node, resolve) {
    // Root node: load workspace directory
    if (node.level === 0) {
      if (!this.CLISettings || !this.CLISettings.cc_path) {
        return resolve([]); 
      }
      
      // Start file watcher as soon as the root node loads
      console.log('Starting file watcher:', this.CLISettings.cc_path);
      this.setupWorkspaceWatcher(this.CLISettings.cc_path);

      try {
        const res = await window.electronAPI.readDirectory(this.CLISettings.cc_path);
        if (res.success) {
          return resolve(res.data);
        } else {
          this.$message?.error(this.t('readDirError') || 'Failed to read workspace directory: ' + res.error);
          return resolve([]);
        }
      } catch (error) {
        console.error(error);
        return resolve([]);
      }
    }

    // Child node: load selected subdirectory
    if (node.level > 0 && node.data.isDirectory) {
      try {
        const res = await window.electronAPI.readDirectory(node.data.path);
        if (res.success) {
          return resolve(res.data);
        } else {
          this.$message?.error(this.t('readDirError') || 'Failed to read subdirectory: ' + res.error);
          return resolve([]);
        }
      } catch (error) {
        console.error(error);
        return resolve([]);
      }
    }
    
    resolve([]);
  },

  // 2. Open file with system default application
  openWorkspaceFile(filePath) {
    if (window.electronAPI && window.electronAPI.openPath) {
      window.electronAPI.openPath(filePath);
    }
  },

  // 3. Delete file or directory
  async deleteWorkspaceFile(data, node) {
    try {
      // Show confirmation dialog using Element Plus this.$confirm
      await this.$confirm(
        (this.t('confirmDelete') || 'Move this file to the recycle bin?') + `\n${data.name}`,
        this.t('warning') || 'Warning',
        { 
          confirmButtonText: this.t('confirm') || 'Confirm',
          cancelButtonText: this.t('cancel') || 'Cancel',
          type: 'warning' 
        }
      );
      
      const res = await window.electronAPI.deleteWorkspaceFile(data.path);
      if (res.success) {
        showNotification(this.t('deleteSuccess'),'success');
        // Remove node from the UI without reloading the entire directory tree
        const parent = node.parent;
        const children = parent.data.children || parent.childNodes;
        const index = children.findIndex(d => d.data.path === data.path);
        if (index !== -1) {
          children.splice(index, 1);
        }
        
      } else {
        showNotification(this.t('deleteFailed'),'error');
      }
    } catch (error) {
      // Do nothing if the user cancels
    }
  },

  // 5. Refresh workspace tree
  refreshWorkspaceTree() {
    // Changing key recreates el-tree and triggers load()
    this.workspaceTreeKey += 1;
  },

    // Upload logic
    async executeUpload(targetPath) {
        try {
            // 1. Open file selection dialog
            const result = await window.electronAPI.openFileDialog();
            
            if (result.canceled || result.filePaths.length === 0) return;

            // 2. Upload
            const uploadRes = await window.electronAPI.uploadToWorkspace(targetPath, result.filePaths);
            
            if (uploadRes.success) {
                showNotification(this.t('uploadSuccess'),'success');
                this.refreshWorkspaceTree(); // Refresh to display new files
            } else {
                showNotification(this.t('uploadFailed'),'error');
            }
        } catch (err) {
            console.error('Upload Error:', err);
            this.$message.error('Operation failed. Check the console log.');
        }
    },

    // Top button: upload to root
    handleRootUpload() {
        const rootPath = this.CLISettings.cc_path;
        if (!rootPath) {
            showNotification(this.t('pleaseConfigWorkspace'),'error');
            return;
        }
        this.executeUpload(rootPath);
    },

    // Folder button: upload to subdirectory
    handleFolderUpload(folderPath) {
        console.log("Uploading to subdirectory:", folderPath);
        this.executeUpload(folderPath);
    },

  // Add affection dimension
  addLoveDimension() {
    if (!this.loveSettings.dimensions) {
      this.loveSettings.dimensions = [];
    }
    this.loveSettings.dimensions.push(""); // Append an empty string
    this.autoSaveSettings();
  },

  // Remove affection dimension
  removeLoveDimension(idx) {
    if (this.loveSettings.dimensions && this.loveSettings.dimensions.length > 1) {
      this.loveSettings.dimensions.splice(idx, 1);
      this.autoSaveSettings();
    }
  },

  // ---------------- Relationship system: configuration ----------------
  addLoveDimension() {
    if (!this.loveSettings.dimensions) this.loveSettings.dimensions = [];
    this.loveSettings.dimensions.push("");
    this.autoSaveSettings();
  },
  removeLoveDimension(idx) {
    if (this.loveSettings.dimensions && this.loveSettings.dimensions.length > 1) {
      this.loveSettings.dimensions.splice(idx, 1);
      this.autoSaveSettings();
    }
  },

  // ---------------- Relationship system: data management ----------------
  
  handleAffectionTabChange(tabName) {
    if (tabName === 'data') {
      this.fetchAffectionData();
    }
  },

  async fetchAffectionData() {
    try {
      // Request FastAPI route
      const response = await fetch('/api/affection/get_data');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      this.affectionRawData = data || {};
      
      // Convert object to array for el-table
      this.affectionDataList = Object.keys(this.affectionRawData).map(userName => {
        return {
          userName: userName,
          ...this.affectionRawData[userName]
        };
      });
      
      console.log("Relationship data loaded:", this.affectionDataList); // Debug output
    } catch (error) {
      console.error("Failed to fetch relationship data:", error);
      if (this.$message) this.$message.error("Could not load relationship data. Check that the backend is running.");
    }
  },

  // 3. Save frontend changes to backend
  async syncAffectionDataToBackend() {
    try {
      // Convert array back to object structure, e.g. {"companion": {love: 10}}
      const newData = {};
      this.affectionDataList.forEach(item => {
        const { userName, ...dimensionsData } = item;
        newData[userName] = dimensionsData;
      });

      this.affectionRawData = newData; // Update local cache

      // Send POST request using fetch
      const response = await fetch('/api/affection/save_data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      if (this.$message) this.$message.success("Relationship data synchronized");
    } catch (error) {
      console.error("Failed to save relationship data:", error);
      if (this.$message) this.$message.error("Failed to save relationship data");
    }
  },

  // 3. Open add/edit dialog
  openAffectionDataDialog(row = null) {
    this.isEditingAffection = !!row; // A supplied row indicates edit mode
    
    if (row) {
      // Edit: deep copy current row
      this.currentAffectionForm = JSON.parse(JSON.stringify(row));
    } else {
      // Add: initialize all dimensions to zero
      const newForm = { userName: '' };
      if (this.loveSettings.dimensions) {
        this.loveSettings.dimensions.forEach(dim => {
          newForm[dim] = 0;
        });
      }
      this.currentAffectionForm = newForm;
    }
    
    this.showAffectionDataDialog = true;
  },

  // 4. Save dialog form
  saveAffectionData() {
    const form = this.currentAffectionForm;
    if (!form.userName) return;

    if (this.isEditingAffection) {
      // Find and replace
      const index = this.affectionDataList.findIndex(item => item.userName === form.userName);
      if (index !== -1) {
        this.affectionDataList.splice(index, 1, { ...form });
      }
    } else {
      // Check for duplicate usernames
      const exists = this.affectionDataList.find(item => item.userName === form.userName);
      if (exists) {
        this.$message.warning("This username already exists");
        return;
      }
      // Append new user
      this.affectionDataList.push({ ...form });
    }

    this.showAffectionDataDialog = false;
    this.syncAffectionDataToBackend(); // Synchronize changes to backend
  },

  // 5. Delete user data
  deleteAffectionData(userName) {
    this.$confirm(this.t('confirmDelete') || "Delete this user's data?", this.t('warning') || 'Warning', {
      confirmButtonText: this.t('confirm') || 'Confirm',
      cancelButtonText: this.t('cancel') || 'Cancel',
      type: 'warning'
    }).then(() => {
      const index = this.affectionDataList.findIndex(item => item.userName === userName);
      if (index !== -1) {
        this.affectionDataList.splice(index, 1);
        this.syncAffectionDataToBackend(); // Synchronize changes to backend
      }
    }).catch(() => {});
  },

    // ---------------- Diary system ----------------
    handleDiaryTabChange(tabName) {
      if (tabName === 'data') {
        this.refreshDiaryView();
      }
    },

    // Refresh diary view (book list, then current book contents)
    async refreshDiaryView() {
      await this.fetchDiaryBooks();
      await this.fetchDiaryData();
    },

    async fetchDiaryBooks() {
      try {
        const response = await fetch('/api/diary/books');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        this.diaryBooks = (data && Array.isArray(data.books)) ? data.books : [];
        // Fall back to default if selected book no longer exists
        if (!this.diaryBooks.some(b => b.bookId === this.diaryCurrentBook)) {
          this.diaryCurrentBook = 'default';
        }
      } catch (error) {
        console.error("Failed to fetch diary books:", error);
      }
    },

    async fetchDiaryData() {
      try {
        const bookId = this.diaryCurrentBook || 'default';
        const response = await fetch(`/api/diary/get_data?book_id=${encodeURIComponent(bookId)}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        this.diaryEntries = (data && Array.isArray(data.entries)) ? data.entries : [];
      } catch (error) {
        console.error("Failed to fetch diary entries:", error);
        if (this.$message) this.$message.error("Could not load diary data. Check that the backend is running.");
      }
    },

    // Switch displayed diary book
    switchDiaryBook(bookId) {
      if (!bookId || bookId === this.diaryCurrentBook) return;
      this.diaryCurrentBook = bookId;
      this.diaryEntries = [];
      this.fetchDiaryData();
    },

    // Display current character card name, then stored book name; use fallback for default
    diaryBookLabel(book) {
      if (!book) return '';
      if (book.isDefault || book.bookId === 'default') {
        return this.t('diaryDefaultBook') || 'Default diary';
      }
      const mem = (this.memories || []).find(m => String(m.id) === String(book.characterId || book.bookId));
      if (mem && mem.name) return mem.name;
      if (book.characterName) return book.characterName;
      return this.t('diaryUnknownRole') || 'Unknown character';
    },

    // Use character card avatar or default avatar
    diaryBookAvatar(book) {
      if (!book || book.isDefault || book.bookId === 'default') return '';
      const mem = (this.memories || []).find(m => String(m.id) === String(book.characterId || book.bookId));
      if (mem && mem.avatar) return mem.avatar;
      return '';
    },

    openDiaryDetail(entry) {
      this.diaryDetailEntry = entry;
      this.diaryDetailVisible = true;
    },

    closeDiaryDetail() {
      this.diaryDetailVisible = false;
      this.diaryDetailEntry = null;
    },

    deleteDiaryEntryById(id) {
      this.$confirm(this.t('confirmDelete') || 'Delete this diary entry?', this.t('warning') || 'Warning', {
        confirmButtonText: this.t('confirm') || 'Confirm',
        cancelButtonText: this.t('cancel') || 'Cancel',
        type: 'warning'
      }).then(async () => {
        try {
          const response = await fetch('/api/diary/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, book_id: this.diaryCurrentBook || 'default' })
          });
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          this.diaryEntries = this.diaryEntries.filter(e => e.id !== id);
          if (this.diaryDetailEntry && this.diaryDetailEntry.id === id) this.closeDiaryDetail();
          this.fetchDiaryBooks();
          if (this.$message) this.$message.success(this.t('deleted') || 'Deleted');
        } catch (error) {
          console.error("Failed to delete diary entry:", error);
          if (this.$message) this.$message.error("Failed to delete diary entry");
        }
      }).catch(() => {});
    },

    // Enable corresponding underlying tools when diary actions are toggled
    async onDiaryActionToggle(key) {
      const enabled = this.diarySettings.actions[key].enabled;
      // Save diary configuration first
      await this.autoSaveSettings();

      if (!enabled) return;

      try {
        switch (key) {
          case 'webSearch':
            this.webSearchSettings.enabled = true;
            await this.autoSaveSettings();
            showNotification(this.t('diaryAutoTool_webSearch') || 'Web search tools enabled automatically', 'success');
            break;

          case 'knowledge':
            if (!this.knowledgeBases || this.knowledgeBases.length === 0) {
              showNotification(this.t('diaryAutoTool_noKb') || 'No knowledge base configured. Add one in Knowledge Base settings.', 'warning');
              break;
            }
            if (!this.knowledgeBases.some(kb => kb.enabled)) {
              this.knowledgeBases[0].enabled = true;
            }
            await this.autoSaveSettings();
            showNotification(this.t('diaryAutoTool_knowledge') || 'Knowledge base tools enabled automatically', 'success');
            break;

          case 'browserControl':
            this.chromeMCPSettings.enabled = true;
            this.chromeMCPSettings.type = 'internal';
            if (this.isElectron && window.electronAPI) {
              const cdpInfo = await window.electronAPI.getInternalCDPInfo();
              if (cdpInfo.active) {
                this.chromeMCPSettings.CDPport = cdpInfo.port;
              }
            }
            await this.autoSaveSettings();
            showNotification(this.t('diaryAutoTool_browser') || 'Built-in CDP browser tools enabled automatically', 'success');
            break;

          case 'smartHome':
            if (!this.HASettings.api_key) {
              showNotification(this.t('diaryAutoTool_noHaKey') || 'Configure a Home Assistant API key in Smart Home settings first', 'warning');
              this.diarySettings.actions[key].enabled = false;
              await this.autoSaveSettings();
              break;
            }
            this.HASettings.enabled = true;
            await this.autoSaveSettings();
            const haResp = await fetch('/start_HA', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data: this.HASettings })
            });
            if (haResp.ok) {
              showNotification(this.t('diaryAutoTool_smartHome') || 'Smart home tools enabled automatically', 'success');
            } else {
              this.HASettings.enabled = false;
              this.diarySettings.actions[key].enabled = false;
              await this.autoSaveSettings();
              const errText = await haResp.text().catch(() => '');
              showNotification(this.t('diaryAutoTool_smartHomeFail') || ('Failed to enable smart home tools: ' + (errText || 'Check the Home Assistant configuration')), 'error');
            }
            break;
        }
      } catch (e) {
        console.error('[Diary] Failed to enable tool automatically:', e);
        showNotification(this.t('diaryAutoTool_error') || ('Failed to enable tools: ' + (e.message || 'Unknown error')), 'error');
      }
    },

    // Action type icons and label colors for template
    diaryMeta(type) {
      return (this.diaryActionMeta && this.diaryActionMeta[type]) || { icon: 'fa-solid fa-book', type: 'info' };
    },

    // Display diary entries received from backend in current conversation
    pushDiaryToChat(content, actionType) {
      // Refresh list if diary is open
      if (this.subMenu === 'diary' && this.activeDiaryTab === 'data') {
        this.refreshDiaryView();
      }
      if (!Array.isArray(this.messages)) return;
      const diaryContent = content || '';
      const entry = {
        id: Date.now() + Math.random(),
        role: 'assistant',
        agentName: (this.t('DiarySystem') || 'Diary'),
        content: diaryContent,
        pure_content: diaryContent,
        // Use standard displayBlocks structure, matching assistant messages
        displayBlocks: [{ type: 'text', content: diaryContent, segments: [{ type: 'text', content: diaryContent }] }],
        segments: [{ type: 'text', content: diaryContent }],
        isDiary: true,
        diaryType: actionType || 'think',
        generationFinished: true,
        timestamp: Date.now()
      };
      this.messages.push(entry);
      // Synchronize to current conversation for persistence and display
      const conv = this.conversations.find(c => c.id === this.conversationId);
      if (conv) {
        conv.messages = this.messages;
      }
      if (typeof this.saveConversations === 'function') {
        this.saveConversations();
      }
      this.$nextTick(() => { if (typeof this.scrollToBottom === 'function') this.scrollToBottom(); });
    },

    // Add @ shortcut when a file is clicked
    handleFileShortcut(fullPath) {
        if (!fullPath) return;

        // 1. Get workspace root
        const rootPath = this.CLISettings.cc_path;
        let relativePath = fullPath;

        // 2. Convert absolute path to workspace-relative path
        if (rootPath && fullPath.startsWith(rootPath)) {
            // Remove root prefix and extra leading separators
            relativePath = fullPath.substring(rootPath.length).replace(/^[/\\]+/, '');
        }

        // 3. Normalize path separators to forward slashes for cross-platform consistency
        relativePath = relativePath.replace(/\\/g, '/');

        // 4. Construct shortcut string
        const shortcut = `@${relativePath} `;

        // 5. Append shortcut to input
        if (!this.userInput) {
            // Assign directly if input is empty
            this.userInput = shortcut;
        } else if (this.userInput.endsWith(' ')) {
            // Append directly if input ends with a space
            this.userInput += shortcut;
        } else {
            // Otherwise insert a space before appending
            this.userInput += ' ' + shortcut;
        }

        // 6. Optionally focus chat input for continued typing
        // If input component uses ref="chatInput"
        this.$nextTick(() => {
            if (this.$refs.chatInput) {
                // For el-input, access underlying input element
                const inputEl = this.$refs.chatInput.$el.querySelector('input') || this.$refs.chatInput.$el.querySelector('textarea');
                if (inputEl) inputEl.focus();
                else this.$refs.chatInput.focus();
            }
        });
    },

    handleOmniTTSenabled(newValue){
      if (newValue === true && this.ttsSettings.enabled === true) {
        this.ttsSettings.enabled = false;
        showNotification(this.t('autoDisableTtsSettings'), 'warning');
      }
      this.autoSaveSettings();
    },

    async handleFullScreenChange(val) {
      if (!val) {
        // When disabling full screen, open region selector
        await this.reselectRegion();
      } else {
        // When enabling full screen, save settings directly
        this.autoSaveSettings();
      }
    },

    /**
      * Show region selector so the user can choose a new screen region
     */
    async reselectRegion() {
      try {
        // Call preload method with true to temporarily hide main window
        const rect = await window.electronAPI.showScreenshotOverlay(true);
        
        // Restore main window after selection
        window.electronAPI.windowAction('show');
        
        if (rect) {
          // Store selected rectangle: [x, y, width, height]
          this.visionControlSettings.ScreenSize = [
            Math.floor(rect.x), 
            Math.floor(rect.y), 
            Math.floor(rect.width), 
            Math.floor(rect.height)
          ];
          this.visionControlSettings.isFullScreen = false;
        } else {
          // Restore full screen if rect is empty, e.g. when user presses Escape
          this.visionControlSettings.isFullScreen = true;
        }
        
        // Trigger autosave
        this.autoSaveSettings();
        
      } catch (error) {
        console.error("Region selection failed:", error);
        // Restore main window and state on error
        window.electronAPI.windowAction('show');
        this.visionControlSettings.isFullScreen = true;
        this.autoSaveSettings();
      }
    },

    // Start workspace monitoring
    setupWorkspaceWatcher(path) {
      if (window.electronAPI && window.electronAPI.startWorkspaceWatch) {
        window.electronAPI.startWorkspaceWatch(path);
        
        window.electronAPI.onWorkspaceChanged((data) => {
          console.log('Filesystem change received:', data.action, data.path);
          
          // Use native timer to preserve this binding
          if (this.workspaceRefreshTimer) {
            clearTimeout(this.workspaceRefreshTimer);
          }
          
          this.workspaceRefreshTimer = setTimeout(() => {
            console.log('Refreshing UI after debounce...');
            this.refreshWorkspaceTreeKeepExpanded();
          }, 500);
        });
      }
    },

    // Preserve expanded nodes before refresh
    refreshWorkspaceTreeKeepExpanded() {
      const treeRef = this.$refs.workspaceTreeRef;
      if (treeRef) {
        const store = treeRef.store;
        const expandedKeys = [];
        for (const key in store.nodesMap) {
          if (store.nodesMap[key].expanded) {
            expandedKeys.push(key);
          }
        }
        this.expandedNodeKeys = expandedKeys;
        console.log('Recorded expanded folder nodes:', this.expandedNodeKeys);
      } else {
        console.warn('el-tree reference (workspaceTreeRef) not found');
      }
      
      this.refreshWorkspaceTree();
    },

// 1. Streaming random topic generation
async generateRandomTopic() {
  if (this.isTopicGenerating) return;
  this.isTopicGenerating = true;
  
  // Clear input before streaming to show typing effect
  this.userInput = ''; 

  try {
    const res = await fetch('/simple_chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.mainAgent,
        messages: [
          {
            role: 'system',
            content: 'Suggest one short, engaging opening question or topic drawn from technology, science fiction, philosophy, or everyday life. Return only the topic or question, without framing text.'
          },
          {
            role: 'user',
            content: 'Suggest an interesting conversation topic in English.'
          }
        ],
        temperature: 1,
        stream: true // Enable streaming
      })
    });

    if (!res.ok) {
      let errMsg = `HTTP error! status: ${res.status}`;
      try { const errData = await res.json(); errMsg = errData?.error?.message || errMsg; } catch (_) {}
      throw new Error(errMsg);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode and append to buffer
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Retain potentially incomplete final line in buffer
      buffer = lines.pop(); 

      for (const line of lines) {
        let trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;

        // Support SSE by stripping data: prefix
        if (trimmed.startsWith('data:')) {
          trimmed = trimmed.replace(/^data:\s?/, '');
        }

        try {
          const data = JSON.parse(trimmed);
          const content = data.choices?.[0]?.delta?.content;
          if (content) {
            // Append to userInput as content arrives
            this.userInput += content;
          }
        } catch (e) {
          // Ignore lines that fail parsing
        }
      }
    }

  } catch (e) {
    console.error("Failed to generate topic", e);
    // Fallback: display a random topic directly
    const fallbackTopics = ["Will future AI have emotions?", "Recommend a book you've read recently", "If you could teleport instantly, where would you want to go?"];
    this.userInput = fallbackTopics[Math.floor(Math.random() * fallbackTopics.length)];
  } finally {
    this.isTopicGenerating = false;
  }
},

// 2. Send from dashboard
handleDashboardSend() {
  if (!this.userInput.trim()) return;
  // Navigate to chat
  this.activeMenu = 'home';
  this.clearMessages();
  // Call existing send method
  this.$nextTick(() => {
    this.sendMessage();
  });
},

// 3. Confirm general-purpose agent
confirmOmniAgent() {
  if (!this.CLISettings.cc_path) {
    showNotification(this.t('pleaseSelectWorkspaceFirst'), 'error');
    return;
  }
  // Enable CLI
  this.CLISettings.enabled = true;
  this.handleEnableToggle(true);
  // Close dialog and navigate
  this.showOmniAgentDialog = false;
  this.activeMenu = 'home';
  showNotification(this.t('omniAgentEnabled'));
},

// 4. Extension bookmarks
toggleFavoriteExtension(ext) {
  const index = this.favoriteExtensionIds.indexOf(ext.id);
  if (index > -1) {
    this.favoriteExtensionIds.splice(index, 1);
  } else {
    this.favoriteExtensionIds.push(ext.id);
  }
  // Persist data
  localStorage.setItem('favorite_extensions', JSON.stringify(this.favoriteExtensionIds));
},

createNewTask(){
  this.activeMenu = 'home';
  this.expandSidePanel();
  this.activeSideView = 'tasks';

},
openAiBrowser(){
  this.activeMenu = 'ai-browser';
  this.chromeMCPSettings.type = 'internal';
  this.chromeMCPSettings.enabled = true;
  this.changeChromeMCPEnabled();
},

connectToChatApp(){
  this.activeMenu = 'deploy-bot';
  this.subMenu = 'im_bot';
},

startLiveStream(){
  this.activeMenu = 'deploy-bot';
  this.subMenu = 'live_stream';
},

gotoAddExtension(){
  this.activeMenu = 'api-group';
  this.subMenu = 'extension';
  this.openAddExtensionDialog();
},

  // 2. Mouse state handlers
  handleExtMouseMove() {
    this.extButtonVisible = true;
    
    // Clear previous timer
    if (this.extMouseTimer) {
      clearTimeout(this.extMouseTimer);
    }
    
    // Hide button after 1.5 seconds without mouse movement
    this.extMouseTimer = setTimeout(() => {
      this.extButtonVisible = false;
    }, 1500);
  },
  
  hideExtButton() {
    this.extButtonVisible = false;
    if (this.extMouseTimer) {
      clearTimeout(this.extMouseTimer);
    }
  },

  async toggleVTSConnection() {
    // Prevent repeated clicks while connecting
    if (this.isVTSStarting) return;
    
    this.isVTSStarting = true; // Show loading spinner
    
    try {
      if (this.VTSConfig.enabled) {
        // Action: disconnect
        // Wait for backend confirmation before setting enabled to false
        this.sendTTSStatusToVRM('stopVTS_Driver', {});
      } else {
        // Action: connect
        this.sendTTSStatusToVRM('startVTS_Driver', this.VTSConfig);
        
        // Set ten-second timeout
        // Revert state if no backend WebSocket status arrives within ten seconds
        setTimeout(() => {
          if (this.isVTSStarting) {
            this.isVTSStarting = false;
            showNotification('VTS connection timed out. Check that the backend is running.', 'warning', 'Connection timed out');
          }
        }, 10000);
      }
    } catch (e) {
      console.error("VTS operation failed:", e);
      this.isVTSStarting = false;
      showNotification('Failed to send command. Check the network.', 'error');
    }
  },
  
  async startVTS() {
    // Send simulated or actual WebSocket command
    this.sendTTSStatusToVRM('startVTS_Driver', this.VTSConfig);
    this.VTSConfig.enabled = true;
    this.autoSaveSettings();
  },
  
  async stopVTS() {
    this.sendTTSStatusToVRM('stopVTS_Driver', {});
    this.VTSConfig.enabled = false;
    this.autoSaveSettings();
  },


  connectToVTS() {
      this.activeMenu = 'deploy-bot';
      this.subMenu = 'vts_config';
      if(!this.VTSConfig.enabled){
        this.toggleVTSConnection();
      }
  },

  connectToSoulx() {
      this.activeMenu = 'deploy-bot';
      this.subMenu = 'soulx_config';
  },

  async checkAcpxStatus() {
    this.checkingAcpx = true
    try {
      const host = window.location.hostname || '127.0.0.1'
      const port = window.location.port || '3456'
      const res = await fetch(`http://${host}:${port}/api/acpx/status`)
      const data = await res.json()
      
      if (data.available) {
        this.acpxStatus = 'available'
        showNotification(`ACPM Ready - Environment: ${data.environment}`)
      } else {
        this.acpxStatus = 'unavailable'
        showNotification(`ACPM Not Found: ${data.error}`,'error')
      }
    } catch (err) {
      this.acpxStatus = 'unavailable'
      showNotification('Failed to check ACPX status','error')
    } finally {
      this.checkingAcpx = false
    }
  },

  // 1. Fetch current path on initialization
  async fetchDataPath() {
    try {
      const response = await fetch('/api/system/data-path');
      if (response.ok) {
        const data = await response.json();
        this.customDataPath = data.path;
        this.isDocker = data.is_docker;
      }
    } catch (error) {
      console.error("fetchDataPath Error:", error);
    }
  },

  // 2. Browse directory using Electron dialog
  async browseDataDirectory() {
    if (!this.isElectron) {
      showNotification('Available only in the desktop app', 'warning');
      return;
    }
    try {
      // Call the preload method mapped in main.js
      // If preload maps dialog:openDirectory, use the following:
      const result = await window.electronAPI.openDirectoryDialog(); 
      if (!result.canceled && result.filePaths.length > 0) {
        this.customDataPath = result.filePaths[0];
      }
    } catch (error) {
      console.error('Directory selection failed:', error);
      showNotification('Failed to select directory', 'error');
    }
  },

  // 3. Apply and save path
  async saveDataPath() {
    if (!this.customDataPath || !this.customDataPath.trim()) {
      showNotification(this.t('pathCannotBeEmpty'), 'warning');
      return;
    }
    try {
      await this.$confirm(this.t('confirmChangePathText'), this.t('warning'), {
        confirmButtonText: this.t('confirm'),
        cancelButtonText: this.t('cancel'),
        type: 'warning'
      });

      const response = await fetch('/api/system/set-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.customDataPath.trim() })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        showNotification(this.t('pathUpdateSuccess'), 'success');
        this.showRestartDialog = true; // Open restart confirmation
      } else {
        showNotification(data.detail || 'Update failed', 'error');
      }
    } catch (error) {
      if (error !== 'cancel') showNotification(error.message, 'error');
    }
  },

  // 4. Reset path
  async resetDataPath() {
    try {
      await this.$confirm(this.t('confirmResetPathText'), this.t('warning'), {
        confirmButtonText: this.t('confirm'),
        cancelButtonText: this.t('cancel'),
        type: 'warning'
      });

      const response = await fetch('/api/system/reset-path', { method: 'POST' });
      const data = await response.json();

      if (response.ok && data.success) {
        showNotification(this.t('pathResetSuccess'), 'success');
        this.customDataPath = data.path;
        this.showRestartDialog = true;
      }
    } catch (error) {
      if (error !== 'cancel') showNotification('Reset failed', 'error');
    }
  },

  // 5. Open current folder in file explorer
  async openDataFolder() {
    if (this.customDataPath) {
      if (this.isElectron) {
        // Use electronAPI.openPath
        // It calls shell.openPath to open the directory
        window.electronAPI.openPath(this.customDataPath);
      } else {
        showNotification('Available only in the desktop app', 'warning');
      }
    } else {
      showNotification('Path has not loaded', 'warning');
    }
  },

    // Open save background dialog
    openSaveBgDialog() {
      if (!this.systemSettings.backgroundURL) {
        // Use showNotification and this.t()
        showNotification(this.t('noBgToSave'), 'warning');
        return;
      }
      this.newBgName = '';
      this.saveBgDialogVisible = true;
    },

    // Confirm saving background to history
    confirmSaveBg() {
      if (!this.newBgName.trim()) {
        // Use showNotification and this.t()
        showNotification(this.t('pleaseInputBgName'), 'warning');
        return;
      }

      // Initialize list if missing in legacy data
      if (!this.systemSettings.bgHistoryList) {
        this.systemSettings.bgHistoryList = [];
      }

      // Check whether current URL already exists in history
      const existingIndex = this.systemSettings.bgHistoryList.findIndex(
        bg => bg.url === this.systemSettings.backgroundURL
      );

      if (existingIndex !== -1) {
        // Update name if it exists
        this.systemSettings.bgHistoryList[existingIndex].name = this.newBgName.trim();
      } else {
        // Otherwise append a record
        this.systemSettings.bgHistoryList.push({
          name: this.newBgName.trim(),
          url: this.systemSettings.backgroundURL
        });
      }

      // Autosave settings
      this.autoSaveSettings();

      this.saveBgDialogVisible = false;
      
      // Show success notification
      showNotification(this.t('bgSavedSuccess'), 'success');
    },

    // Select background from history
    handleBgHistorySelect(url) {
      this.systemSettings.backgroundURL = url;
      if (!url) {
        // Use existing clearing logic when no background is selected
        if (typeof this.clearBgImage === 'function') {
          this.clearBgImage();
        } else {
          this.autoSaveSettings();
        }
      } else {
        this.autoSaveSettings();
      }
    },

    // Delete a background history record
    deleteBgHistory(url) {
      if (!this.systemSettings.bgHistoryList) return;
      
      this.systemSettings.bgHistoryList = this.systemSettings.bgHistoryList.filter(
        item => item.url !== url
      );
      
      // Save automatically after deletion
      this.autoSaveSettings();
      
      // Show deletion success notification
      showNotification(this.t('bgRemovedSuccess'), 'success');
    },

    onShowDisclaimerChange(val) {
      if (val) {
        this.systemSettings.disclaimerAccepted = false;
      }
      this.autoSaveSettings();
    },

    acceptDisclaimer() {
      this.showDisclaimerDialog = false;
      if (isSteamBuild) { return; }
      if (this.disclaimerAccepted) {
        this.systemSettings.disclaimerAccepted = true;
        this.systemSettings.showDisclaimer = false;
        this.autoSaveSettings();
      }
    },

    // ============================================================
    // Account management methods
    // ============================================================
    async loadAccountList() {
      if (!isElectron) return;
      try {
        const result = await window.electronAPI.accountsGetAll();
        if (result) {
          this.accountList = result.accounts;
          this.isRootAccount = result.accounts.some(a => a.id === result.currentAccountId && a.type === 'root');
          this.currentAccountInfo = result.accounts.find(a => a.id === result.currentAccountId) || null;
        }
      } catch (e) {
        console.error('Failed to load accounts:', e);
      }
    },

    async selectAccountDataPath() {
      if (!isElectron) return;
      try {
        const result = await window.electronAPI.openDirectoryDialog();
        if (result && result.filePaths && result.filePaths.length > 0) {
          this.newAccountDataPath = result.filePaths[0];
        }
      } catch (e) {
        console.error('Directory selection failed:', e);
      }
    },

    async confirmAddAccount() {
      if (!this.newAccountDataPath) {
        showNotification(this.t('pleaseSelectDataPath') || 'Select a data storage path', 'warning');
        return;
      }

      try {
        const result = await window.electronAPI.accountsCreate(
          this.newAccountName || null,
          this.newAccountDataPath,
          this.newAccountCloneFromRoot,
          this.newAccountSetAsDefault
        );

        if (result.success) {
          showNotification(this.t('accountCreated') || 'Account created', 'success');
          this.showAddAccountDialog = false;
          this.newAccountName = '';
          this.newAccountDataPath = '';
          this.newAccountCloneFromRoot = true;
          this.newAccountSetAsDefault = false;
          await this.loadAccountList();
        } else {
          showNotification(result.error || (this.t('accountCreateFailed') || 'Failed to create account'), 'error');
        }
      } catch (e) {
        console.error('Failed to create account:', e);
        showNotification(this.t('accountCreateFailed') || 'Failed to create account', 'error');
      }
    },

    confirmDeleteAccount(acc) {
      this.deleteAccountId = acc.id;
      this.deleteAccountRemoveFolder = true;
      this.showDeleteAccountDialog = true;
    },

    async confirmDeleteAccountAction() {
      if (!this.deleteAccountId) return;
      try {
        const result = await window.electronAPI.accountsDelete(this.deleteAccountId, this.deleteAccountRemoveFolder);
        if (result.success) {
          showNotification(this.t('accountDeleted') || 'Account deleted', 'success');
          this.showDeleteAccountDialog = false;
          this.deleteAccountId = null;
          await this.loadAccountList();
        } else {
          showNotification(result.error || (this.t('accountDeleteFailed') || 'Failed to delete account'), 'error');
        }
      } catch (e) {
        console.error('Failed to delete account:', e);
        showNotification(this.t('accountDeleteFailed') || 'Failed to delete account', 'error');
      }
    },

    renameAccountDialog(acc) {
      this.renameAccountId = acc.id;
      this.renameAccountName = acc.name;
      this.showRenameAccountDialog = true;
    },

    async confirmRenameAccount() {
      if (!this.renameAccountId || !this.renameAccountName) return;
      try {
        const result = await window.electronAPI.accountsRename(this.renameAccountId, this.renameAccountName);
        if (result.success) {
          showNotification(this.t('accountRenamed') || 'Account renamed', 'success');
          this.showRenameAccountDialog = false;
          this.renameAccountId = null;
          this.renameAccountName = '';
          await this.loadAccountList();
        } else {
          showNotification(result.error || (this.t('accountRenameFailed') || 'Rename failed'), 'error');
        }
      } catch (e) {
        console.error('Failed to rename account:', e);
      }
    },

    async setDefaultAccount(accountId) {
      try {
        const result = await window.electronAPI.accountsSetDefault(accountId);
        if (result.success) {
          showNotification(this.t('defaultAccountSet') || 'Default account set', 'success');
          await this.loadAccountList();
        } else {
          showNotification(result.error || (this.t('defaultAccountSetFailed') || 'Failed to save setting'), 'error');
        }
      } catch (e) {
        console.error('Failed to set default account:', e);
      }
    },

    async launchAccount(accountId) {
      try {
        const result = await window.electronAPI.accountsLaunch(accountId);
        if (result.success) {
          showNotification(this.t('accountLaunching') || 'Launching a new instance...', 'success');
        } else {
          showNotification(result.error || (this.t('accountLaunchFailed') || 'Startup failed'), 'error');
        }
      } catch (e) {
        console.error('Failed to launch account:', e);
      }
    },

    async switchToAccount(accountId) {
      try {
        await this.autoSaveSettings();
        await new Promise(r => setTimeout(r, 200));
        const result = await window.electronAPI.accountsSwitch(accountId);
        if (!result.success) {
          showNotification(result.error || (this.t('accountSwitchFailed') || 'Switch failed'), 'error');
        }
      } catch (e) {
        console.error('Failed to switch account:', e);
      }
    },
  
}
