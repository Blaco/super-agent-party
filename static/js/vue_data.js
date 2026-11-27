const isElectron = window.electronAPI ? true : false;
const isSteamBuild = window.__IS_STEAM_BUILD__ || false;
// Event listener setup
if (isElectron) {
    document.addEventListener('contextmenu', (e) => {
      const imgTarget = e.target.closest('img');
      
      if (imgTarget) {
        e.preventDefault();
        window.electronAPI.showContextMenu('image', { 
          src: imgTarget.src,
          x: e.x,
          y: e.y
        });
      } else {
        window.electronAPI.showContextMenu('default');
      }
    });
  
    HOST = "127.0.0.1"
    PORT = window.location.port
    document.addEventListener('click', async (event) => {
      const link = event.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href');
      
      try {
        const url = new URL(href);
        
        if (url.hostname === HOST && 
            url.port === PORT &&
            url.pathname.startsWith('/uploaded_files/')) {
          event.preventDefault();
          
          // Use the preload interface to handle paths
          const filename = url.pathname.split('/uploaded_files/')[1];
          const filePath = window.electronAPI.pathJoin(
            window.electronAPI.getAppPath(), 
            'uploaded_files', 
            filename
          );
          
          await window.electronAPI.openPath(filePath);
          return;
        }
        if (['http:', 'https:'].includes(url.protocol)) {
          event.preventDefault();
          await window.electronAPI.openExternal(href); // Call electronAPI
          return;
        }
        
      } catch {
        event.preventDefault();
        window.location.href = href;
      }
    });
  }
  else {
    HOST = window.location.hostname
    PORT = window.location.port
  }
  // Check the protocol
  const protocol = window.location.protocol;
  const backendURL = `${window.location.protocol}//${window.location.host}`;
let vue_data = {
    isMac: false,
    isWindows: false,
    partyURL:`${window.location.protocol}//${window.location.host}`,
    downloadProgress: 0,
    updateDownloaded: false,
    updateAvailable: false,
    updateInfo: null,
    updateIcon: 'fa-solid fa-download',
    system_prompt: ' ',
    SystemPromptsList: [],          // System prompt array
    extensionsSystemPromptsDict: {}, // Extension prompt dictionary
    showPromptDialog: false,        // Dialog visibility
    promptForm: {                   // Dialog form binding
      id: null,
      name: '',
      content: ''
    },
    selectSystemPromptId: null,    // Selected system prompt ID
    wakeWindowTimer: null,   // Timer
    withinWakeWindow: false, // Whether the 30-second wake-word-free window is active
    isdocker: false,
    isExpanded: true,
    isElectron: isElectron,
    isSteamBuild: isSteamBuild,
    isStandaloneChatPage: window.location.pathname.includes('chat.html'),
    isCollapse: true,
    isBtnCollapse: true,
    activeMenu: 'home',
    // Display companion-relevant settings by default. Optional SAP panels remain available.
    showOptionalFeatures: false,
    activeLiveTab: 'live',
    isMaximized: false,
    hasUpdate: false,
    updateSuccess: false,
    audioCtx: null,          // Web Audio context
    activeSources: [], 
    audioStartTime: 0,       // Scheduled start time for the next frame
    omniQueue: [],        // [{idx, text, expressions, voice, pcmBase64}, ...]
    omniIdx: 0,           // Index currently playing
    isOmniPlaying: false, // Playback state
    settings: {
      model: '',
      base_url: '',
      api_key: '',
      temperature: 1,  // Default temperature
      max_tokens: 8192,    // Default maximum output length
      max_rounds: 0,    // Default maximum rounds
      selectedProvider: null,
      top_p: 1,
      reasoning_effort: null,
      enableOmniTTS: false,// Enable Omni TTS
      omniVoice: 'Cherry', // Omni TTS voice
      extra_params: [], // Additional parameters
    },
    fastSettings: {
      enabled: false, // Disabled by default
      triggerMode: 'conditional', // Conditional triggering by default
      model: '',
      base_url: '',
      api_key: '',
      temperature: 1,  // Default temperature
      max_tokens: 8192,    // Default maximum output length
      max_rounds: 0,    // Default maximum rounds
      selectedProvider: null,
      top_p: 1,
      reasoning_effort: null,
      enableOmniTTS: false,// Enable Omni TTS
      omniVoice: 'Cherry', // Omni TTS voice
      extra_params: [], // Additional parameters
      conditionMaxLen: 200,       // Trigger only below this character limit
      conditionNoNewline: true,   // Require text without line breaks
      conditionNoFiles: true,     // Require no images or files
    },
    reasonerSettings: {
      enabled: false, // Disabled by default
      model: '',
      base_url: '',
      api_key: '',
      selectedProvider: null,
      temperature: 1,  // Default temperature
      max_tokens: 4096,  // Default maximum output length
      stop_words: [',', '.', '，', '。'], // Stop-word list
      reasoning_effort: null,
    },
    target_lang: 'en-US',
    reasoningEfforts:[
      { value: null, label: 'reason-null' },
      { value: 'minimal', label: 'reason-minimal' },
      { value: 'low', label: 'reason-low' },
      { value: 'medium', label: 'reason-medium' },
      { value: 'high', label: 'reason-high' },
      { value: 'xhigh', label: 'reason-xhigh' },
      { value: 'max', label: 'reason-max' },
      { value: 'none', label: 'reason-none' },
    ],
    visionSettings: {
      enabled: false, // Disabled by default
      model: '',
      base_url: '',
      api_key: '',
      selectedProvider: null,
      temperature: 1,  // Default temperature
      desktopVision: false,
      wakeWord: 'see\nlook\ndesktop',
      enableWakeWord: false,
    },
    paramTypes:[
      { value: 'string', label: 'string' },
      { value: 'integer', label: 'integer' },
      { value: 'float', label: 'float' },
      { value: 'boolean', label: 'boolean' },
      { value: 'json', label: 'JSON' } // Consolidated JSON option
    ],
    ws: null,
    messages: [],
    cur_audioDatas: [],
    userInput: '',
    isTyping: false,
    currentMessage: '',
    conversationId: null, // Current conversation ID
    conversations: [], // Conversation history
    conversationGroups: [],
    collapsedConversationGroups: {},
    chatHistoryPanelOpen: true,
    chatHistoryPanelWidth: 320,
    draftConversationGroupId: 'default',
    activeConversationGroupId: 'default',
    showConversationGroupDialog: false,
    conversationGroupDialogMode: 'create',
    conversationGroupForm: {
      id: null,
      name: '',
      memoryEnabled: false,
    },
    showConversationRenameDialog: false,
    conversationRenameForm: {
      id: null,
      name: '',
    },
    showDeleteConversationDialog: false,
    deleteConversationForm: {
      id: null,
      title: '',
      deleteMemory: false,
    },
    showDeleteGroupDialog: false,
    deleteGroupForm: {
      id: null,
      name: '',
      conversationCount: 0,
    },
    showHistoryDialog: false,
    showLLMToolsDialog: false,
    showHttpToolDialog: false,
    showComfyUIDialog: false,
    showStickerPacksDialog: false,
    showGsvRefAudioPathDialog: false,
    showModelDialog: false,
    showLogoDialog: false,
    deletingConversationId: null, // Conversation ID being deleted
    jsonFile: null,
    models: [],
    modelsLoading: false,
    modelsError: null,
    isThinkOpen: false,
    showEditDialog: false,
    editContent: '',
    editType: 'system', // Or 'message'
    editIndex: null,
    asyncToolsID : [],
    TTSrunning:false,
    ASRrunning:false,
    isInputting: false,
    toolsSettings: {
      asyncTools: {
        enabled: false,
      },
      a2ui: {
        enabled: false,
      },
      time: {
        enabled: false,
        triggerMode: 'beforeThinking',
      },
      weather: {
        enabled: false
      },
      wikipedia: {
        enabled: false,
      },
      arxiv: {
        enabled: false,
      },
      hideToolResults: {
        enabled: false,
      },
      getFile: {
        enabled: false,
      },
      language: {
        enabled: false, // Disabled by default
        language: 'en-US',
        tone: 'normal',
      },
      inference: {
        enabled: false, // Disabled by default
      },
      deepsearch: {
        enabled: false, // Disabled by default
      },
      formula: {
        enabled: true
      },
      autoBehavior: {
        enabled: false
      },
    },
    toolForShowInfo: {"name": "", "description": ""},
    showToolInfoDialog: false,
    mcpServers: {},
    showAddMCPDialog: false,
    showMCPConfirm: false,
    deletingMCPName: null,
    newMCPJson: '',
    newMCPFormData: {
      name: 'mcp',
      command: '',
      args:'',
      env: '',
      url: '',
      apiKey: '',
    },
    newMCPType: 'stdio', // Type field
    mcpInputType: 'form', // Default input mode; also supports 'form'
    currentMCPExample: '',
    mcpURLDict: {
      stdio: 'http://127.0.0.1:8000/mcp',
      sse: 'http://127.0.0.1:8000/sse',
      ws: 'ws://127.0.0.1:8000/ws',
      streamablehttp: 'http://127.0.0.1:8000/mcp'
    },
    mcpExamples: {
      stdio: `{
  "mcpServers": {
    "echo-server": {
      "command": "node",
      "args": [
        "path/to/echo-mcp/build/index.js"
      ],
      "disabled": false
    }
  }
}`,
      sse: `{
  "mcpServers": {
    "sse-server": {
      "url": "http://127.0.0.1:8000/sse",
      "headers": {
        "Content-Type": "text/event-stream",
        "Authorization": "Bearer YOUR_API_KEY"
      },
      "disabled": false
    }
  }
}`,
      ws: `{
  "mcpServers": {
    "websocket-server": {
      "url": "ws://127.0.0.1:8000/ws",
      "disabled": false
    }
  }
}`,
    streamablehttp: `{
  "mcpServers": {
    "streamablehttp-server": {
      "url": "http://127.0.0.1:8000/mcp",
      "headers": {
        "Content-Type": "application/json",
        "Authorization": "Bearer YOUR_API_KEY"
      },
      "disabled": false
    }
  }
}`
    },
    activeKbTab: 'settings', // Initially active tab
    activeReadTab: 'full', // Initially active tab
    webSearchSettings: {
      enabled: false,
      engine: 'tavily',
      crawler: 'mdnew',
      when: 'after_thinking',
      duckduckgo_max_results: 10, // Default result limit
      searxng_url: `http://127.0.0.1:8080`,
      searxng_engines: "bing,duckduckgo,google",
      searxng_is_select:false,
      searxng_max_results: 10, // Default result limit
      tavily_max_results: 10, // Default result limit
      tavily_api_key: '',
      jina_api_key: '',
      Crawl4Ai_url: 'http://127.0.0.1:11235',
      Crawl4Ai_api_key: 'test_api_code',
      google_max_results: 10, // Default result limit
      google_api_key: '',
      google_cse_id: '',
      brave_max_results: 10, // Default result limit
      brave_api_key: '',
      exa_max_results:10,
      exa_api_key: '',
      serper_max_results:10,
      serper_api_key: '',
      youcom_max_results: 10,
      youcom_api_key: '',
      youcom_tier: 'free',
      firecrawl_url: 'https://api.firecrawl.dev/v2', // Official API or self-hosted endpoint
      firecrawl_api_key: '',
      firecrawl_mode: 'scrape', 
    },
    codeSettings: {
      enabled: false,
      engine: 'e2b',
      e2b_api_key: '',
      sandbox_url: 'http://127.0.0.1:8080',
    },
    CLISettings: {
      enabled: false,
      visibilityScope: 'workspace',
      engine: 'local',
      cc_path: '',
      shortcut: true,
      max_iterations: 100,
      mode_change: false
    },
    visionControlSettings:{
      enabled: false,
      mouse:true,
      keyboard:true,
      desktopVision: true,
      onlyNewScreen: true,
      isEnableGrid: true, // Enable grid
      isFullScreen: true, // Full-screen capture
      ScreenSize : [0,0,1280,720], // Capture rectangle x1 y1 x2 y2 when not full-screen
    },
    ccSettings: {
      enabled: false,
      selectedProvider: null,
      base_url:'',
      api_key:'',
      model:'',
      permissionMode: 'default',
    },
    qcSettings: {
      enabled: false,
      selectedProvider: null,
      base_url:'',
      api_key:'',
      model:'',
      permissionMode: 'default',
    },
    dsSettings: {
      enabled: false,
      permissionMode: 'default',
    },
    localEnvSettings: {
      enabled: false,
      permissionMode: 'default',
    },
    wslSettings: {
      enabled: false,
      permissionMode: 'default',
    },
    ocSettings: {
      enabled: false,
      selectedProvider: null,
      base_url:'',
      api_key:'',
      model:'',
      permissionMode: 'default',
    },
    HASettings: {
      enabled: false,
      api_key: '',
      url: 'http://127.0.0.1:8123',
    },
    chromeMCPSettings: {
      enabled: false,
      mcpName: 'browser-mcp', // browser-mcp or playwright-mcp
      type:"external", // external or internal
      CDPport:9222,
      browserVision: false,
      onlyNewScreen: true,
    },
    localAppControlSettings: {
      enabled: false,
      browserVision: false,
      onlyNewScreen: true,
      forceNewInstance: false,
      scannedApps: [],
      connectedApps: {},
      nextPort: 9223,
      scanning: false,
      selectedApp: null,
      manualApps: [],
    },
    localAppSearch: "",
    manualAppInput: "",
    connectingAppId: null,
    sqlSettings:{
      enabled: false,
      engine: "sqlite",
      user: "",
      password: "",
      host:"",
      port:5432,
      dbname: "",
      dbpath: "",
    },
    knowledgeBases: [],
    KBSettings: {
      when: 'after_thinking',
      is_rerank: false,
      selectedProvider: null,
      model: '',
      base_url: '',
      api_key: '',
      top_n: 5,
    },
    showAddKbDialog: false,
    showKnowledgeDialog: false,
    showMCPServerDialog: false,
    a2aServers: {},
    showA2AServerDialog: false,
    showAddA2ADialog: false,
    newA2AUrl: '',
    activeCollapse: [],
    newKb: {
      name: '',
      introduction: '',
      providerId: null,
      model: '',
      base_url: '',
      api_key: '',
      chunk_size: 2048,
      chunk_overlap: 512,
      chunk_k: 5,
      weight: 0.5,
      processingStatus: 'processing',
    },
    newKbFiles: [],
    systemSettings: {
      language: 'en-US',
      theme: 'light',
      fontScale: 1, 
      codeFontScale: 1, 
      autoCollapseInput: false, 
      network: "local",
      proxy: 'http://127.0.0.1:7890',
      proxyMode: 'system', 
      chatMode: 'standard', 
      githubProxy: '', 
      backgroundURL: '',
      bgHistoryList: [],
      customCSS: '',
      contentSafety: false,
      disclaimerAccepted: false,
      showDisclaimer: true,
      goal_iterations: 30,
      enableShortcuts: true,
      enableNotifications: false,
    },
    saveBgDialogVisible: false,
    newBgName: '',
    networkOptions:[
      { value: 'local', label: 'local' }, 
      { value: 'global', label: 'allDevicesVisible' },
    ],
    imgHostOptions:[
      { value: 'easyImage2', label: 'easyImage2' }
    ],
    showRestartDialog: false,
    showCDPRestartDialog: false,
    agents: {},
    showAgentForm: false,
    editingAgent: null,
    showAgentDialog: false,
    mainAgent: 'super-model',
    newAgent: {
      id: '',
      name: '',
      system_prompt: ''
    },
    editingAgent: false,
    currentLanguage: 'en-US',
    translations: translations,
    themeValues: ['light', 'dark','midnight','desert','neon','marshmallow','ink','party',"rainbow"],
    isBrowserOpening: false,
    expandedSections: {
      settingsBase: true,
      reasonerConfig: true,
      language: true,
      superapi: true,
      webSearchConfig: true,
      duckduckgoConfig: true,
      searxngConfig: true,
      tavilyConfig: true,
      jinaConfig: true,
      Crawl4AiConfig: true,
      youcomConfig: true,
      settingsAdvanced: true,
      reasonerAdvanced: true,
      knowledgeAdvanced: false,
    },
    abortController: null, // Controller for cancelling requests
    isSending: false, // Sending state
    showAddDialog: false,
    modelProviders: [],
    // Update state
    updateAvailable: false,
    updateInfo: null,
    updateDownloaded: false,
    downloadProgress: 0,
    fileLinks: [],
    audioContext: null,
    mediaStream: null,
    mediaRecorder: null,
    audioChunks: [],
    isRecording: false,
    vad: null,
    speechTimeout: null,
    currentAudioChunks: [],
    currentTranscriptionId: null,
    speechStartTime: null,
    recognition: null,
    sherpaModelExists: false,             // Whether the model is already installed
    sherpaDownloading: false,             // Download state
    sherpaPercent: 0,                     // Live progress, 0-100
    sherpaEventSource: null,               // Current SSE instance
    sherpaModelName: '',                 // Model name
    minilmModelExists: false,       // Whether the model is already installed
    minilmDownloading: false,       // Download state
    minilmPercent: 0,               // Live progress, 0-100
    minilmEventSource: null,        // Current SSE instance
    mossModelExists: false,
    mossDownloading: false,
    mossDownloadSource: '',
    mossPollInterval: null,
    mossPercent: 0, // Actual progress percentage

    asrSettings: {
      enabled: false,
      engine: 'sherpa',
      selectedProvider: null,
      webSpeechLanguage: 'auto',
      vendor: "OpenAI",
      model: "",
      base_url: "",
      api_key: "",
      funasr_ws_url: "ws://127.0.0.1:10095",
      funasr_mode: "offline",
      interactionMethod: "auto",
      hotkey : "Alt",
      wakeWord: "companion",
      endWord: "end conversation",
      hotwords: "companion 80\nend conversation 80",
    },
    supportedLanguages: [
      { code: 'en-US', name: 'English' },
      { code: 'ja-JP', name: 'Japanese' },
      { code: 'ko-KR', name: 'Korean' },
      { code: 'es-ES', name: 'Español' },
      { code: 'fr-FR', name: 'Français' },
      { code: 'de-DE', name: 'Deutsch' },
      { code: 'ru-RU', name: 'Русский' },
    ],
    userInputBuffer: '',
    sidePanelOpen: false,
    sidePanelHTML: '',
    chatAreaOpen: true,        // Whether the chat area is expanded
    chatAreaWidth: 50,         // Chat area width percentage
    sidePanelWidth: 50,        // Side panel width percentage
    savedSidePanelWidth: null, // Remember the previous panel width
    isResizing: false,         // Resizing state
    isHistoryPanelResizing: false,
    minPanelWidth: 25,         // Minimum panel width percentage
    extensions: [],              // All discovered extensions
    currentExtension: null,      // Currently loaded extension
    sidePanelURL: '',            // Extension URL displayed in the side panel
    showExtensionsDialog: false, // Extension picker dialog visibility
    showExtensionForm: false, // Extension form visibility
    newExtensionUrl: '',   // Input binding
    remotePlugins: [], // Remote plugin list
    installedPlugins: [], // Locally installed plugins
    installLoading: false,
    refreshing: false,
    refreshButtonText: "",
    showHistorySidebar: false,
    ttsSettings: {
      enabled: false,
      engine: 'edgetts',
      separators:["。", "\n", "？", "！", "，","～","!","?",",","~"],
      maxConcurrency: 2,
      enabledInterruption: false,
      bufferWordList: [],
      SampleText: 'Hello! This is a voice test.',
      edgettsLanguage: 'en-US',
      edgettsGender: 'Female',
      edgettsVoice: 'JennyNeural',
      edgettsRate: 1.0,
      gsvServer: "http://127.0.0.1:9880",
      gsvTextLang: 'en',
      gsvRate: 1.0,
      gsvPromptLang: 'en',
      gsvPromptText: '',
      gsvSample_steps: 4,
      gsvRefAudioPath: '',
      gsvAudioOptions: [],
      selectedProvider: null,
      vendor: "OpenAI",
      model: "",
      base_url: "",
      api_key: "",
      openaiVoice:"alloy",
      openaiStream: false,
      openaiSpeed: 1.0,
      customTTSserver: "http://127.0.0.1:9880",
      customTTSspeaker: "",
      customTTSspeed: 1.0,
      customStream: false,
      customTTSKeyText: 'text',
      customTTSKeySpeaker: 'speaker',
      customTTSKeySpeed: 'speed',
      systemVoiceName: null,
      systemRate: 200,
      // Tetos shared voice-list cache (refresh when the engine changes)
      tetosVoices: [],
      isFetchingVoices: false,

      // Azure
      azureSpeechKey: '',
      azureRegion: '',
      azureVoice: '',

      // Fish Audio
      fishApiKey: '',
      fishVoice: '',

      // Google
      googleServiceAccount: '', // JSON string
      googleVoice: '',
      newtts:{},


      // elevenLabs
      elevenLabsApiKey: '',
      elevenLabsVoice: 'JBFqnCBsd6RMkjVDRZzb',
      elevenLabsModel: 'eleven_multilingual_v2',
      elevenLabsRate: 1.0,


      // moss
      mossVoice: 'Ava',
      mossSpeed: 1.0,
    },
    activeTTSTab: 'default', // Active TTS tab
    showAddTTSDialog: false, // Add TTS dialog visibility
    newTTSConfig: {
      name: '',
      enabled: false,
      SampleText: 'Hello! This is a voice test.',
      engine: 'edgetts',
      edgettsLanguage: 'en-US',
      edgettsGender: 'Female',
      edgettsVoice: 'JennyNeural',
      edgettsRate: 1.0,
      gsvServer: "http://127.0.0.1:9880",
      gsvTextLang: 'en',
      gsvRate: 1.0,
      gsvSample_steps: 4,
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
      systemVoiceName: null,
      systemRate: 200,
      // Tetos shared voice-list cache (refresh when the engine changes)
      tetosVoices: [],
      isFetchingVoices: false,

      // Azure
      azureSpeechKey: '',
      azureRegion: '',
      azureVoice: '',

      // Fish Audio
      fishApiKey: '',
      fishVoice: '',

      // Google
      googleServiceAccount: '', // JSON string
      googleVoice: '',

      mossVoice: 'Ava',
      mossSpeed: 1.0,

      newtts:{}
    },
    cur_voice :'default',
    openaiVoices:['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'],
    showMoreButtonDialog: false,
    isAssistantMode: false,
    isDynamicIsland: false,
    isMinimalMode: false,
    isFixedWindow: false,
    MoreButtonDict: [
      {"name": "brieflyButton", "enabled": true},
      {"name": "forceScrollButton", "enabled": true},
      {"name": "expandButton", "enabled": true},
      {"name": "fileButton", "enabled": true},
      {"name": "fastResponseButton", "enabled": true},
      {"name": "reasonerButton", "enabled": true},
      {"name": "deepSearchButton", "enabled": false},
      {"name": "visionButton", "enabled": false},
      {"name": "screenshotButton", "enabled": true},
      {"name": "desktopVisionButton", "enabled": false},
      {"name": "text2imgButton", "enabled": false},
      {"name": "asrButton", "enabled": true},
      {"name": "ttsButton", "enabled": true},
      {"name": "knowledgeBaseButton", "enabled": true},
      {"name": "webSearchButton", "enabled": true},
      {"name": "memoryButton", "enabled": true},
      {"name": "uiButton", "enabled": true},
      {"name": "codeButton", "enabled": false},
      {"name": "CLIButton", "enabled": false},
      {"name": "visionControl", "enabled": false},
      {"name": "stickerButton", "enabled": false},
      {"name": "haButton", "enabled": false},
      {"name": "chromeButton", "enabled": false},
      {"name": "sqlButton", "enabled": false},
      {"name": "agentButton", "enabled": false},
      {"name": "llmButton", "enabled": false},
      {"name": "mcpButton", "enabled": true},
      {"name": "a2aButton", "enabled": false},
      {"name": "httpButton", "enabled": false},
      {"name": "comfyuiButton", "enabled": false},
      {"name": "vrmButton", "enabled": true},
      {"name": "thaButton", "enabled": true},
      {"name": "soulxButton", "enabled": true},
      {"name": "behaviorBotton", "enabled": false},
      {"name": "groupChatBotton", "enabled": true},
    ],
    largeMoreButtonDict:[
      {"name": "brieflyButton", "enabled": true},
      {"name": "forceScrollButton", "enabled": true},
      {"name": "expandButton", "enabled": true},
      {"name": "fileButton", "enabled": true},
      {"name": "fastResponseButton", "enabled": true},
      {"name": "reasonerButton", "enabled": true},
      {"name": "deepSearchButton", "enabled": false},
      {"name": "visionButton", "enabled": false},
      {"name": "desktopVisionButton", "enabled": false},
      {"name": "screenshotButton", "enabled": true},
      {"name": "text2imgButton", "enabled": false},
      {"name": "asrButton", "enabled": true},
      {"name": "ttsButton", "enabled": true},
      {"name": "knowledgeBaseButton", "enabled": true},
      {"name": "webSearchButton", "enabled": true},
      {"name": "memoryButton", "enabled": true},
      {"name": "uiButton", "enabled": true},
      {"name": "codeButton", "enabled": false},
      {"name": "CLIButton", "enabled": false},
      {"name": "visionControl", "enabled": false},
      {"name": "stickerButton", "enabled": false},
      {"name": "haButton", "enabled": false},
      {"name": "chromeButton", "enabled": false},
      {"name": "sqlButton", "enabled": false},
      {"name": "agentButton", "enabled": false},
      {"name": "llmButton", "enabled": false},
      {"name": "mcpButton", "enabled": true},
      {"name": "a2aButton", "enabled": false},
      {"name": "httpButton", "enabled": false},
      {"name": "comfyuiButton", "enabled": false},
      {"name": "vrmButton", "enabled": true},
      {"name": "thaButton", "enabled": true},
      {"name": "soulxButton", "enabled": true},
      {"name": "behaviorBotton", "enabled": false},
      {"name": "groupChatBotton", "enabled": true},
    ],
    smallMoreButtonDict:[
      {"name": "brieflyButton", "enabled": false},
      {"name": "forceScrollButton", "enabled": false},
      {"name": "expandButton", "enabled": false},
      {"name": "fileButton", "enabled": false},
      {"name": "fastResponseButton", "enabled": false},
      {"name": "reasonerButton", "enabled": false},
      {"name": "deepSearchButton", "enabled": false},
      {"name": "visionButton", "enabled": false},
      {"name": "desktopVisionButton", "enabled": true},
      {"name": "screenshotButton", "enabled": true},
      {"name": "text2imgButton", "enabled": false},
      {"name": "asrButton", "enabled": false},
      {"name": "ttsButton", "enabled": false},
      {"name": "knowledgeBaseButton", "enabled": false},
      {"name": "webSearchButton", "enabled": false},
      {"name": "memoryButton", "enabled": false},
      {"name": "uiButton", "enabled": false},
      {"name": "codeButton", "enabled": false},
      {"name": "CLIButton", "enabled": false},
      {"name": "visionControl", "enabled": false},
      {"name": "stickerButton", "enabled": false},
      {"name": "haButton", "enabled": false},
      {"name": "chromeButton", "enabled": false},
      {"name": "sqlButton", "enabled": false},
      {"name": "agentButton", "enabled": false},
      {"name": "llmButton", "enabled": false},
      {"name": "mcpButton", "enabled": false},
      {"name": "a2aButton", "enabled": false},
      {"name": "httpButton", "enabled": false},
      {"name": "comfyuiButton", "enabled": false},
      {"name": "vrmButton", "enabled": true},
      {"name": "thaButton", "enabled": true},
      {"name": "soulxButton", "enabled": true},
      {"name": "behaviorBotton", "enabled": false},
      {"name": "groupChatBotton", "enabled": false},
    ],
    showVrmModelDialog: false,
    vrmOnline: false,   // VRM connection state
    vrmPollTimer: null, // VRM polling timer
    newVrmModel: {
      name: '',
      displayName: '',
      file: null
    },
    showGaussSceneDialog: false, // GAUSS
    newGaussScene: { name: '', displayName: '' }, // GAUSS
    VRMConfig: {
      name: 'default',
      enabledExpressions: false,
      enabledMotions: false,
      selectedModelId: 'alice', // Select the Alice model by default
      windowWidth: 540,
      windowHeight: 960,
      defaultModels: [], // Default models
      userModels: [],     // User-uploaded models
      defaultMotions: [], // Default motions
      userMotions: [],     // User-uploaded motions
      selectedMotionIds: [],
      selectedNewModelId: 'alice',
      selectedNewMotionIds: [],
      newVRM:{},
      gaussDefaultScenes: [],   // GAUSS
      gaussUserScenes: [],      // GAUSS
      selectedGaussSceneId: '',
    },
    THAConfig: {
      name: 'default',
      enabledEmotions: false,
      enabledFineControl: false,
      enabledMouthSync: false,
      srMode: 'cnnx2vl',
      selectedModelId: 'Lyra',
      windowWidth: 540,
      windowHeight: 540,
      defaultModels: [],
      userModels: []
    },
    SoulxConfig: {
      name: 'default',
      enabled: false,
      serverUrl: 'ws://127.0.0.1:8765',
      condImage: '',
      selectedImageId: '',
      images: [],
      transparentBg: true,
      windowWidth: 512,
      windowHeight: 512
    },
    newSoulxImage: {
      file: null,
      name: '',
      displayName: ''
    },
    showThaModelDialog: false,
    newThaModel: {
      file: null,
      name: '',
      displayName: ''
    },
    newAppearanceConfig: {
      name: '',
      windowWidth: 540,
      windowHeight: 960,
      selectedModelId: 'alice', // Select the Alice model by default
      selectedMotionIds: [],
    },
    showAddAppearanceDialog: false,
    showVrmaMotionDialog: false,
    showFileDialog: false,
    newVrmaMotion: {
      name: '',
      displayName: '',
      file: null
    },
    expressionMap : [
      '<happy>', 
      '<angry>', 
      '<sad>',
      '<neutral>',
      '<surprised>', 
      '<relaxed>'],
    newGsvAudio: {
      name: '',
      path: '',
      text: '',
    },
    startTime: null,
    elapsedTime: 0,
    gsvTextLangs:["zh", "en" , "yue","ja","ko","auto","auto_yue"],
    audioPlayQueue: [],
    currentAudio: null,
    edgettsLanguage: 'en-US',
    edgettsGender: 'Female',
    edgettsvoices: [
    { language: "af-ZA", gender: "Female", name: "AdriNeural" },
    { language: "af-ZA", gender: "Male", name: "WillemNeural" },
    { language: "am-ET", gender: "Male", name: "AmehaNeural" },
    { language: "am-ET", gender: "Female", name: "MekdesNeural" },
    { language: "ar-AE", gender: "Female", name: "FatimaNeural" },
    { language: "ar-AE", gender: "Male", name: "HamdanNeural" },
    { language: "ar-BH", gender: "Male", name: "AliNeural" },
    { language: "ar-BH", gender: "Female", name: "LailaNeural" },
    { language: "ar-DZ", gender: "Female", name: "AminaNeural" },
    { language: "ar-DZ", gender: "Male", name: "IsmaelNeural" },
    { language: "ar-EG", gender: "Female", name: "SalmaNeural" },
    { language: "ar-EG", gender: "Male", name: "ShakirNeural" },
    { language: "ar-IQ", gender: "Male", name: "BasselNeural" },
    { language: "ar-IQ", gender: "Female", name: "RanaNeural" },
    { language: "ar-JO", gender: "Female", name: "SanaNeural" },
    { language: "ar-JO", gender: "Male", name: "TaimNeural" },
    { language: "ar-KW", gender: "Male", name: "FahedNeural" },
    { language: "ar-KW", gender: "Female", name: "NouraNeural" },
    { language: "ar-LB", gender: "Female", name: "LaylaNeural" },
    { language: "ar-LB", gender: "Male", name: "RamiNeural" },
    { language: "ar-LY", gender: "Female", name: "ImanNeural" },
    { language: "ar-LY", gender: "Male", name: "OmarNeural" },
    { language: "ar-MA", gender: "Male", name: "JamalNeural" },
    { language: "ar-MA", gender: "Female", name: "MounaNeural" },
    { language: "ar-OM", gender: "Male", name: "AbdullahNeural" },
    { language: "ar-OM", gender: "Female", name: "AyshaNeural" },
    { language: "ar-QA", gender: "Female", name: "AmalNeural" },
    { language: "ar-QA", gender: "Male", name: "MoazNeural" },
    { language: "ar-SA", gender: "Male", name: "HamedNeural" },
    { language: "ar-SA", gender: "Female", name: "ZariyahNeural" },
    { language: "ar-SY", gender: "Female", name: "AmanyNeural" },
    { language: "ar-SY", gender: "Male", name: "LaithNeural" },
    { language: "ar-TN", gender: "Male", name: "HediNeural" },
    { language: "ar-TN", gender: "Female", name: "ReemNeural" },
    { language: "ar-YE", gender: "Female", name: "MaryamNeural" },
    { language: "ar-YE", gender: "Male", name: "SalehNeural" },
    { language: "az-AZ", gender: "Male", name: "BabekNeural" },
    { language: "az-AZ", gender: "Female", name: "BanuNeural" },
    { language: "bg-BG", gender: "Male", name: "BorislavNeural" },
    { language: "bg-BG", gender: "Female", name: "KalinaNeural" },
    { language: "bn-BD", gender: "Female", name: "NabanitaNeural" },
    { language: "bn-BD", gender: "Male", name: "PradeepNeural" },
    { language: "bn-IN", gender: "Male", name: "BashkarNeural" },
    { language: "bn-IN", gender: "Female", name: "TanishaaNeural" },
    { language: "bs-BA", gender: "Male", name: "GoranNeural" },
    { language: "bs-BA", gender: "Female", name: "VesnaNeural" },
    { language: "ca-ES", gender: "Male", name: "EnricNeural" },
    { language: "ca-ES", gender: "Female", name: "JoanaNeural" },
    { language: "cs-CZ", gender: "Male", name: "AntoninNeural" },
    { language: "cs-CZ", gender: "Female", name: "VlastaNeural" },
    { language: "cy-GB", gender: "Male", name: "AledNeural" },
    { language: "cy-GB", gender: "Female", name: "NiaNeural" },
    { language: "da-DK", gender: "Female", name: "ChristelNeural" },
    { language: "da-DK", gender: "Male", name: "JeppeNeural" },
    { language: "de-AT", gender: "Female", name: "IngridNeural" },
    { language: "de-AT", gender: "Male", name: "JonasNeural" },
    { language: "de-CH", gender: "Male", name: "JanNeural" },
    { language: "de-CH", gender: "Female", name: "LeniNeural" },
    { language: "de-DE", gender: "Female", name: "AmalaNeural" },
    { language: "de-DE", gender: "Male", name: "ConradNeural" },
    { language: "de-DE", gender: "Male", name: "FlorianMultilingualNeural" },
    { language: "de-DE", gender: "Female", name: "KatjaNeural" },
    { language: "de-DE", gender: "Male", name: "KillianNeural" },
    { language: "de-DE", gender: "Female", name: "SeraphinaMultilingualNeural" },
    { language: "el-GR", gender: "Female", name: "AthinaNeural" },
    { language: "el-GR", gender: "Male", name: "NestorasNeural" },
    { language: "en-AU", gender: "Female", name: "NatashaNeural" },
    { language: "en-AU", gender: "Male", name: "WilliamNeural" },
    { language: "en-CA", gender: "Female", name: "ClaraNeural" },
    { language: "en-CA", gender: "Male", name: "LiamNeural" },
    { language: "en-GB", gender: "Female", name: "LibbyNeural" },
    { language: "en-GB", gender: "Female", name: "MaisieNeural" },
    { language: "en-GB", gender: "Male", name: "RyanNeural" },
    { language: "en-GB", gender: "Female", name: "SoniaNeural" },
    { language: "en-GB", gender: "Male", name: "ThomasNeural" },
    { language: "en-HK", gender: "Male", name: "SamNeural" },
    { language: "en-HK", gender: "Female", name: "YanNeural" },
    { language: "en-IE", gender: "Male", name: "ConnorNeural" },
    { language: "en-IE", gender: "Female", name: "EmilyNeural" },
    { language: "en-IN", gender: "Female", name: "NeerjaExpressiveNeural" },
    { language: "en-IN", gender: "Female", name: "NeerjaNeural" },
    { language: "en-IN", gender: "Male", name: "PrabhatNeural" },
    { language: "en-KE", gender: "Female", name: "AsiliaNeural" },
    { language: "en-KE", gender: "Male", name: "ChilembaNeural" },
    { language: "en-NG", gender: "Male", name: "AbeoNeural" },
    { language: "en-NG", gender: "Female", name: "EzinneNeural" },
    { language: "en-NZ", gender: "Male", name: "MitchellNeural" },
    { language: "en-NZ", gender: "Female", name: "MollyNeural" },
    { language: "en-PH", gender: "Male", name: "JamesNeural" },
    { language: "en-PH", gender: "Female", name: "RosaNeural" },
    { language: "en-SG", gender: "Female", name: "LunaNeural" },
    { language: "en-SG", gender: "Male", name: "WayneNeural" },
    { language: "en-TZ", gender: "Male", name: "ElimuNeural" },
    { language: "en-TZ", gender: "Female", name: "ImaniNeural" },
    { language: "en-US", gender: "Female", name: "AnaNeural" },
    { language: "en-US", gender: "Male", name: "AndrewMultilingualNeural" },
    { language: "en-US", gender: "Male", name: "AndrewNeural" },
    { language: "en-US", gender: "Female", name: "AriaNeural" },
    { language: "en-US", gender: "Female", name: "AvaMultilingualNeural" },
    { language: "en-US", gender: "Female", name: "AvaNeural" },
    { language: "en-US", gender: "Male", name: "BrianMultilingualNeural" },
    { language: "en-US", gender: "Male", name: "BrianNeural" },
    { language: "en-US", gender: "Male", name: "ChristopherNeural" },
    { language: "en-US", gender: "Female", name: "EmmaMultilingualNeural" },
    { language: "en-US", gender: "Female", name: "EmmaNeural" },
    { language: "en-US", gender: "Male", name: "EricNeural" },
    { language: "en-US", gender: "Male", name: "GuyNeural" },
    { language: "en-US", gender: "Female", name: "JennyNeural" },
    { language: "en-US", gender: "Female", name: "MichelleNeural" },
    { language: "en-US", gender: "Male", name: "RogerNeural" },
    { language: "en-US", gender: "Male", name: "SteffanNeural" },
    { language: "en-ZA", gender: "Female", name: "LeahNeural" },
    { language: "en-ZA", gender: "Male", name: "LukeNeural" },
    { language: "es-AR", gender: "Female", name: "ElenaNeural" },
    { language: "es-AR", gender: "Male", name: "TomasNeural" },
    { language: "es-BO", gender: "Male", name: "MarceloNeural" },
    { language: "es-BO", gender: "Female", name: "SofiaNeural" },
    { language: "es-CL", gender: "Female", name: "CatalinaNeural" },
    { language: "es-CL", gender: "Male", name: "LorenzoNeural" },
    { language: "es-CO", gender: "Male", name: "GonzaloNeural" },
    { language: "es-CO", gender: "Female", name: "SalomeNeural" },
    { language: "es-CR", gender: "Male", name: "JuanNeural" },
    { language: "es-CR", gender: "Female", name: "MariaNeural" },
    { language: "es-CU", gender: "Female", name: "BelkysNeural" },
    { language: "es-CU", gender: "Male", name: "ManuelNeural" },
    { language: "es-DO", gender: "Male", name: "EmilioNeural" },
    { language: "es-DO", gender: "Female", name: "RamonaNeural" },
    { language: "es-EC", gender: "Female", name: "AndreaNeural" },
    { language: "es-EC", gender: "Male", name: "LuisNeural" },
    { language: "es-ES", gender: "Male", name: "AlvaroNeural" },
    { language: "es-ES", gender: "Female", name: "ElviraNeural" },
    { language: "es-ES", gender: "Female", name: "XimenaNeural" },
    { language: "es-GQ", gender: "Male", name: "JavierNeural" },
    { language: "es-GQ", gender: "Female", name: "TeresaNeural" },
    { language: "es-GT", gender: "Male", name: "AndresNeural" },
    { language: "es-GT", gender: "Female", name: "MartaNeural" },
    { language: "es-HN", gender: "Male", name: "CarlosNeural" },
    { language: "es-HN", gender: "Female", name: "KarlaNeural" },
    { language: "es-MX", gender: "Female", name: "DaliaNeural" },
    { language: "es-MX", gender: "Male", name: "JorgeNeural" },
    { language: "es-NI", gender: "Male", name: "FedericoNeural" },
    { language: "es-NI", gender: "Female", name: "YolandaNeural" },
    { language: "es-PA", gender: "Female", name: "MargaritaNeural" },
    { language: "es-PA", gender: "Male", name: "RobertoNeural" },
    { language: "es-PE", gender: "Male", name: "AlexNeural" },
    { language: "es-PE", gender: "Female", name: "CamilaNeural" },
    { language: "es-PR", gender: "Female", name: "KarinaNeural" },
    { language: "es-PR", gender: "Male", name: "VictorNeural" },
    { language: "es-PY", gender: "Male", name: "MarioNeural" },
    { language: "es-PY", gender: "Female", name: "TaniaNeural" },
    { language: "es-SV", gender: "Female", name: "LorenaNeural" },
    { language: "es-SV", gender: "Male", name: "RodrigoNeural" },
    { language: "es-US", gender: "Male", name: "AlonsoNeural" },
    { language: "es-US", gender: "Female", name: "PalomaNeural" },
    { language: "es-UY", gender: "Male", name: "MateoNeural" },
    { language: "es-UY", gender: "Female", name: "ValentinaNeural" },
    { language: "es-VE", gender: "Female", name: "PaolaNeural" },
    { language: "es-VE", gender: "Male", name: "SebastianNeural" },
    { language: "et-EE", gender: "Female", name: "AnuNeural" },
    { language: "et-EE", gender: "Male", name: "KertNeural" },
    { language: "fa-IR", gender: "Female", name: "DilaraNeural" },
    { language: "fa-IR", gender: "Male", name: "FaridNeural" },
    { language: "fi-FI", gender: "Male", name: "HarriNeural" },
    { language: "fi-FI", gender: "Female", name: "NooraNeural" },
    { language: "fil-PH", gender: "Male", name: "AngeloNeural" },
    { language: "fil-PH", gender: "Female", name: "BlessicaNeural" },
    { language: "fr-BE", gender: "Female", name: "CharlineNeural" },
    { language: "fr-BE", gender: "Male", name: "GerardNeural" },
    { language: "fr-CA", gender: "Male", name: "AntoineNeural" },
    { language: "fr-CA", gender: "Male", name: "JeanNeural" },
    { language: "fr-CA", gender: "Female", name: "SylvieNeural" },
    { language: "fr-CA", gender: "Male", name: "ThierryNeural" },
    { language: "fr-CH", gender: "Female", name: "ArianeNeural" },
    { language: "fr-CH", gender: "Male", name: "FabriceNeural" },
    { language: "fr-FR", gender: "Female", name: "DeniseNeural" },
    { language: "fr-FR", gender: "Female", name: "EloiseNeural" },
    { language: "fr-FR", gender: "Male", name: "HenriNeural" },
    { language: "fr-FR", gender: "Male", name: "RemyMultilingualNeural" },
    { language: "fr-FR", gender: "Female", name: "VivienneMultilingualNeural" },
    { language: "ga-IE", gender: "Male", name: "ColmNeural" },
    { language: "ga-IE", gender: "Female", name: "OrlaNeural" },
    { language: "gl-ES", gender: "Male", name: "RoiNeural" },
    { language: "gl-ES", gender: "Female", name: "SabelaNeural" },
    { language: "gu-IN", gender: "Female", name: "DhwaniNeural" },
    { language: "gu-IN", gender: "Male", name: "NiranjanNeural" },
    { language: "he-IL", gender: "Male", name: "AvriNeural" },
    { language: "he-IL", gender: "Female", name: "HilaNeural" },
    { language: "hi-IN", gender: "Male", name: "MadhurNeural" },
    { language: "hi-IN", gender: "Female", name: "SwaraNeural" },
    { language: "hr-HR", gender: "Female", name: "GabrijelaNeural" },
    { language: "hr-HR", gender: "Male", name: "SreckoNeural" },
    { language: "hu-HU", gender: "Female", name: "NoemiNeural" },
    { language: "hu-HU", gender: "Male", name: "TamasNeural" },
    { language: "id-ID", gender: "Male", name: "ArdiNeural" },
    { language: "id-ID", gender: "Female", name: "GadisNeural" },
    { language: "is-IS", gender: "Female", name: "GudrunNeural" },
    { language: "is-IS", gender: "Male", name: "GunnarNeural" },
    { language: "it-IT", gender: "Male", name: "DiegoNeural" },
    { language: "it-IT", gender: "Female", name: "ElsaNeural" },
    { language: "it-IT", gender: "Male", name: "GiuseppeMultilingualNeural" },
    { language: "it-IT", gender: "Female", name: "IsabellaNeural" },
    { language: "iu-Cans-CA", gender: "Female", name: "SiqiniqNeural" },
    { language: "iu-Cans-CA", gender: "Male", name: "TaqqiqNeural" },
    { language: "iu-Latn-CA", gender: "Female", name: "SiqiniqNeural" },
    { language: "iu-Latn-CA", gender: "Male", name: "TaqqiqNeural" },
    { language: "ja-JP", gender: "Male", name: "KeitaNeural" },
    { language: "ja-JP", gender: "Female", name: "NanamiNeural" },
    { language: "jv-ID", gender: "Male", name: "DimasNeural" },
    { language: "jv-ID", gender: "Female", name: "SitiNeural" },
    { language: "ka-GE", gender: "Female", name: "EkaNeural" },
    { language: "ka-GE", gender: "Male", name: "GiorgiNeural" },
    { language: "kk-KZ", gender: "Female", name: "AigulNeural" },
    { language: "kk-KZ", gender: "Male", name: "DauletNeural" },
    { language: "km-KH", gender: "Male", name: "PisethNeural" },
    { language: "km-KH", gender: "Female", name: "SreymomNeural" },
    { language: "kn-IN", gender: "Male", name: "GaganNeural" },
    { language: "kn-IN", gender: "Female", name: "SapnaNeural" },
    { language: "ko-KR", gender: "Male", name: "HyunsuMultilingualNeural" },
    { language: "ko-KR", gender: "Male", name: "InJoonNeural" },
    { language: "ko-KR", gender: "Female", name: "SunHiNeural" },
    { language: "lo-LA", gender: "Male", name: "ChanthavongNeural" },
    { language: "lo-LA", gender: "Female", name: "KeomanyNeural" },
    { language: "lt-LT", gender: "Male", name: "LeonasNeural" },
    { language: "lt-LT", gender: "Female", name: "OnaNeural" },
    { language: "lv-LV", gender: "Female", name: "EveritaNeural" },
    { language: "lv-LV", gender: "Male", name: "NilsNeural" },
    { language: "mk-MK", gender: "Male", name: "AleksandarNeural" },
    { language: "mk-MK", gender: "Female", name: "MarijaNeural" },
    { language: "ml-IN", gender: "Male", name: "MidhunNeural" },
    { language: "ml-IN", gender: "Female", name: "SobhanaNeural" },
    { language: "mn-MN", gender: "Male", name: "BataaNeural" },
    { language: "mn-MN", gender: "Female", name: "YesuiNeural" },
    { language: "mr-IN", gender: "Female", name: "AarohiNeural" },
    { language: "mr-IN", gender: "Male", name: "ManoharNeural" },
    { language: "ms-MY", gender: "Male", name: "OsmanNeural" },
    { language: "ms-MY", gender: "Female", name: "YasminNeural" },
    { language: "mt-MT", gender: "Female", name: "GraceNeural" },
    { language: "mt-MT", gender: "Male", name: "JosephNeural" },
    { language: "my-MM", gender: "Female", name: "NilarNeural" },
    { language: "my-MM", gender: "Male", name: "ThihaNeural" },
    { language: "nb-NO", gender: "Male", name: "FinnNeural" },
    { language: "nb-NO", gender: "Female", name: "PernilleNeural" },
    { language: "ne-NP", gender: "Female", name: "HemkalaNeural" },
    { language: "ne-NP", gender: "Male", name: "SagarNeural" },
    { language: "nl-BE", gender: "Male", name: "ArnaudNeural" },
    { language: "nl-BE", gender: "Female", name: "DenaNeural" },
    { language: "nl-NL", gender: "Female", name: "ColetteNeural" },
    { language: "nl-NL", gender: "Female", name: "FennaNeural" },
    { language: "nl-NL", gender: "Male", name: "MaartenNeural" },
    { language: "pl-PL", gender: "Male", name: "MarekNeural" },
    { language: "pl-PL", gender: "Female", name: "ZofiaNeural" },
    { language: "ps-AF", gender: "Male", name: "GulNawazNeural" },
    { language: "ps-AF", gender: "Female", name: "LatifaNeural" },
    { language: "pt-BR", gender: "Male", name: "AntonioNeural" },
    { language: "pt-BR", gender: "Female", name: "FranciscaNeural" },
    { language: "pt-BR", gender: "Female", name: "ThalitaMultilingualNeural" },
    { language: "pt-PT", gender: "Male", name: "DuarteNeural" },
    { language: "pt-PT", gender: "Female", name: "RaquelNeural" },
    { language: "ro-RO", gender: "Female", name: "AlinaNeural" },
    { language: "ro-RO", gender: "Male", name: "EmilNeural" },
    { language: "ru-RU", gender: "Male", name: "DmitryNeural" },
    { language: "ru-RU", gender: "Female", name: "SvetlanaNeural" },
    { language: "si-LK", gender: "Male", name: "SameeraNeural" },
    { language: "si-LK", gender: "Female", name: "ThiliniNeural" },
    { language: "sk-SK", gender: "Male", name: "LukasNeural" },
    { language: "sk-SK", gender: "Female", name: "ViktoriaNeural" },
    { language: "sl-SI", gender: "Female", name: "PetraNeural" },
    { language: "sl-SI", gender: "Male", name: "RokNeural" },
    { language: "so-SO", gender: "Male", name: "MuuseNeural" },
    { language: "so-SO", gender: "Female", name: "UbaxNeural" },
    { language: "sq-AL", gender: "Female", name: "AnilaNeural" },
    { language: "sq-AL", gender: "Male", name: "IlirNeural" },
    { language: "sr-RS", gender: "Male", name: "NicholasNeural" },
    { language: "sr-RS", gender: "Female", name: "SophieNeural" },
    { language: "su-ID", gender: "Male", name: "JajangNeural" },
    { language: "su-ID", gender: "Female", name: "TutiNeural" },
    { language: "sv-SE", gender: "Male", name: "MattiasNeural" },
    { language: "sv-SE", gender: "Female", name: "SofieNeural" },
    { language: "sw-KE", gender: "Male", name: "RafikiNeural" },
    { language: "sw-KE", gender: "Female", name: "ZuriNeural" },
    { language: "sw-TZ", gender: "Male", name: "DaudiNeural" },
    { language: "sw-TZ", gender: "Female", name: "RehemaNeural" },
    { language: "ta-IN", gender: "Female", name: "PallaviNeural" },
    { language: "ta-IN", gender: "Male", name: "ValluvarNeural" },
    { language: "ta-LK", gender: "Male", name: "KumarNeural" },
    { language: "ta-LK", gender: "Female", name: "SaranyaNeural" },
    { language: "ta-MY", gender: "Female", name: "KaniNeural" },
    { language: "ta-MY", gender: "Male", name: "SuryaNeural" },
    { language: "ta-SG", gender: "Male", name: "AnbuNeural" },
    { language: "ta-SG", gender: "Female", name: "VenbaNeural" },
    { language: "te-IN", gender: "Male", name: "MohanNeural" },
    { language: "te-IN", gender: "Female", name: "ShrutiNeural" },
    { language: "th-TH", gender: "Male", name: "NiwatNeural" },
    { language: "th-TH", gender: "Female", name: "PremwadeeNeural" },
    { language: "tr-TR", gender: "Male", name: "AhmetNeural" },
    { language: "tr-TR", gender: "Female", name: "EmelNeural" },
    { language: "uk-UA", gender: "Male", name: "OstapNeural" },
    { language: "uk-UA", gender: "Female", name: "PolinaNeural" },
    { language: "ur-IN", gender: "Female", name: "GulNeural" },
    { language: "ur-IN", gender: "Male", name: "SalmanNeural" },
    { language: "ur-PK", gender: "Male", name: "AsadNeural" },
    { language: "ur-PK", gender: "Female", name: "UzmaNeural" },
    { language: "uz-UZ", gender: "Female", name: "MadinaNeural" },
    { language: "uz-UZ", gender: "Male", name: "SardorNeural" },
    { language: "vi-VN", gender: "Female", name: "HoaiMyNeural" },
    { language: "vi-VN", gender: "Male", name: "NamMinhNeural" },
    { language: "zh-CN", gender: "Female", name: "XiaoxiaoNeural" },
    { language: "zh-CN", gender: "Female", name: "XiaoyiNeural" },
    { language: "zh-CN", gender: "Male", name: "YunjianNeural" },
    { language: "zh-CN", gender: "Male", name: "YunxiNeural" },
    { language: "zh-CN", gender: "Male", name: "YunxiaNeural" },
    { language: "zh-CN", gender: "Male", name: "YunyangNeural" },
    { language: "zh-CN-liaoning", gender: "Female", name: "XiaobeiNeural" },
    { language: "zh-CN-shaanxi", gender: "Female", name: "XiaoniNeural" },
    { language: "zh-HK", gender: "Female", name: "HiuGaaiNeural" },
    { language: "zh-HK", gender: "Female", name: "HiuMaanNeural" },
    { language: "zh-HK", gender: "Male", name: "WanLungNeural" },
    { language: "zh-TW", gender: "Female", name: "HsiaoChenNeural" },
    { language: "zh-TW", gender: "Female", name: "HsiaoYuNeural" },
    { language: "zh-TW", gender: "Male", name: "YunJheNeural" },
    { language: "zu-ZA", gender: "Female", name: "ThandoNeural" },
    { language: "zu-ZA", gender: "Male", name: "ThembaNeural" }
],
    roleTiles:[
        { id: 'memory', title: 'CharacterMemory', icon: 'fa-solid fa-brain' },
        // { id: 'mind', title: 'CharacterMind', icon: 'fa-solid fa-heart' },
        { id: 'sticker', title: 'sticker/image', icon: 'fa-solid fa-face-smile' },
        { id: 'affection', title: 'affectionSystem', icon: 'fa-solid fa-heart' },
        { id: 'diary', title: 'DiarySystem', icon: 'fa-solid fa-book' },
        { id: 'vision', title: 'CharacterVision', icon: 'fa-solid fa-eye'},
        { id: 'behavior', title: 'CharacterBehavior', icon: 'fa-solid fa-person-running' },
        { id: 'voice', title: 'CharacterVoice', icon: 'fa-solid fa-volume-high' },
        { id: 'appearance', title: 'CharacterAppearance', icon: 'fa-solid fa-person' },
    ],
    modelTiles: [
      { id: 'service', title: 'modelService', icon: 'fa-solid fa-cloud' },
      { id: 'main', title: 'mainModel', icon: 'fa-solid fa-microchip' },
      { id: 'fast', title: 'fastModel', icon: 'fa-solid fa-gauge-high' },
      { id: 'reasoner', title: 'reasonerModel', icon: 'fa-solid fa-atom' },
      { id: 'vision', title: 'visionModel' , icon: 'fa-solid fa-camera'},
      { id: 'text2img', title: 'imgModel', icon: 'fa-solid fa-pencil' },
      { id: 'asr', title: 'asrModel', icon: 'fa-solid fa-microphone' },
      { id: 'tts', title: 'ttsModel', icon: 'fa-solid fa-volume-high' },
    ],
    toolkitTiles: [
      { id: 'tools', title: 'utilityTools', icon: 'fa-solid fa-screwdriver-wrench' },
      { id: 'websearch', title: 'webSearch', icon: 'fa-solid fa-globe' },
      { id: 'document', title: 'knowledgeBase', icon: 'fa-solid fa-book' },
        { id: 'interpreter', title: 'interpreter', icon: 'fa-solid fa-code'},
      { id: 'CLI', title: 'CLItool', icon: 'fa-solid fa-computer'},
      { id: 'visionControl', title: 'visionControl', icon: 'fa-solid fa-arrow-pointer'},
      { id: 'HA', title: 'homeAssistant', icon: 'fa-solid fa-house'},
      { id: 'chromeMCP', title: 'browserControl', icon: 'fa-solid fa-compass' },
      { id: 'localAppControl', title: 'localAppControl', icon: 'fa-solid fa-display' },
      { id: 'sql', title: 'sqlControl', icon: 'fa-solid fa-database' },
      { id: 'comfyui', title: 'ComfyUI', icon: 'fa-solid fa-palette'},
      { id: 'mcp', title: 'mcpServers', icon: 'fa-solid fa-server'},
      { id: 'a2a', title: 'a2aServers', icon: 'fa-solid fa-plug'},
      { id: 'llmTool', title: 'llmTools', icon: 'fa-solid fa-network-wired'},
      { id: 'customHttpTool', title: 'customHttpTool', icon: 'fa-solid fa-wifi'},
    ],
    apiTiles: [
      { id: 'openai', title: 'openaiStyleAPI', icon: 'fa-solid fa-link' },
      { id: 'mcp', title: 'MCPStyleAPI', icon: 'fa-solid fa-server' },
      { id: 'agents', title: 'agentSnapshot', icon: 'fa-solid fa-robot'},
      { id: 'docker', title: 'docker', icon: 'fa-solid fa-box'},
      { id: 'browser', title: 'browserMode', icon: 'fa-solid fa-globe' },
      { id: 'develop', title: 'development', icon: 'fa-solid fa-code' },
      { id: 'extension', title: 'extension', icon: 'fa-solid fa-puzzle-piece' },
      { id: 'fastapi', title: 'fastAPIDocs', icon: 'fa-solid fa-book' },
    ],
    storageTiles: [
      { id: 'text', icon: 'fa-solid fa-file-lines', title: 'storageText' },
      { id: 'image', icon: 'fa-solid fa-image', title: 'storageImage' },
      { id: 'video', icon: 'fa-solid fa-video', title: 'storageVideo' }
    ],
    systemTiles: [
      { id: 'general', icon: 'fa-solid fa-gear', title: 'generalSettings' },
      { id: 'appearance', icon: 'fa-solid fa-palette', title: 'appearanceSettings' },
      { id: 'shortcuts', icon: 'fa-solid fa-terminal', title: 'shortcutSettings' },
      { id: 'accounts', icon: 'fa-solid fa-users', title: 'accountManagement' },
    ],
    // Account management
    showAddAccountDialog: false,
    newAccountName: '',
    newAccountDataPath: '',
    newAccountCloneFromRoot: true,
    newAccountSetAsDefault: false,
    accountList: [],
    isRootAccount: false,
    currentAccountInfo: null,
    showDeleteAccountDialog: false,
    deleteAccountId: null,
    deleteAccountRemoveFolder: true,
    renameAccountId: null,
    renameAccountName: '',
    showRenameAccountDialog: false,
    showShortcutHelp: false,
    shortcutMenuOpen: false,
    shortcutMenuIndex: 0,
    shortcutCommands: [
      { id: 'help', syntax: '/help', aliases: ['/?'], scope: 'both', descKey: 'cmd_help_desc' },
      { id: 'new', syntax: '/new', aliases: ['/reset'], scope: 'both', descKey: 'cmd_new_desc' },
      { id: 'stop', syntax: '/stop', aliases: [], scope: 'both', descKey: 'cmd_stop_desc' },
      { id: 'retry', syntax: '/retry', aliases: [], scope: 'web', descKey: 'cmd_retry_desc' },
      { id: 'model', syntax: '/model', aliases: [], scope: 'both', descKey: 'cmd_model_desc' },
      { id: 'personality', syntax: '/personality', aliases: [], scope: 'both', descKey: 'cmd_personality_desc' },
      { id: 'skills', syntax: '/skills', aliases: [], scope: 'both', descKey: 'cmd_skills_desc' },
      { id: 'id', syntax: '/id', aliases: [], scope: 'im', descKey: 'cmd_id_desc' },
      { id: 'sub', syntax: '/sub', aliases: [], scope: 'im', descKey: 'cmd_sub_desc' },
      { id: 'unsub', syntax: '/unsub', aliases: [], scope: 'im', descKey: 'cmd_unsub_desc' },
      { id: 'mode_plan', syntax: '/plan', aliases: [], scope: 'both', requiresCli: true, descKey: 'cmd_plan_desc' },
      { id: 'mode_read', syntax: '/read', aliases: [], scope: 'both', requiresCli: true, descKey: 'cmd_read_desc' },
      { id: 'mode_edit', syntax: '/edit', aliases: [], scope: 'both', requiresCli: true, descKey: 'cmd_edit_desc' },
      { id: 'mode_yolo', syntax: '/yolo', aliases: [], scope: 'both', requiresCli: true, descKey: 'cmd_yolo_desc' },
      { id: 'mode_cowork', syntax: '/cowork', aliases: [], scope: 'both', requiresCli: true, descKey: 'cmd_cowork_desc' },
      { id: 'mode_goal', syntax: '/goal', aliases: [], scope: 'both', requiresCli: true, descKey: 'cmd_goal_desc' },
      { id: 'skill', syntax: '/<skill-name>', aliases: [], scope: 'both', requiresCli: true, descKey: 'cmd_skill_desc' },
      { id: 'memory', syntax: '#<text>', aliases: [], scope: 'both', requiresCli: true, descKey: 'cmd_memory_desc' },
      { id: 'file', syntax: '@<path>', aliases: [], scope: 'web', requiresCli: true, descKey: 'cmd_file_desc' },
    ],
    defaultSeparators: [
      // Escaped characters
      { label: '\\n', value: '\n' },
      { label: '\\n\\n', value: '\n\n' },
      { label: '\\t', value: '\t' },
      { label: ' ', value: ' ' },
      // English punctuation
      { label: '~', value: '~' },
      { label: '.', value: '.' },
      { label: '…', value: '…' },
      { label: '?', value: '?' },
      { label: '!', value: '!' },
      { label: ',', value: ',' },
      { label: ';', value: ';' },
      { label: ':', value: ':' },
      { label: '"', value: '"' },
      { label: '\'', value: '\'' },
      // Other separators
      { label: '*', value: '*' },
      { label: '`', value: '`' },
      { label: '·', value: '·' },
      { label: '-', value: '-' },
      { label: '—', value: '—' },
      { label: '/', value: '/' },
    ],
    behaviorSettings:{
      enabled: false,
      behaviorList:[]
    }, // Behavior settings
    behaviorNameDict:{
      noInput: "noInputName",
      time: "timeName",
      cycle: "cycleName"
    },
    newBehavior:{
      enabled: false,
      trigger: {
        type: "noInput",
        time:{
          timeValue: "00:00:00", // Time value, for example 12:00:00
          days: [] // Weekday list: [1, 2, 3] means Monday through Wednesday; empty means no repetition
        },
        noInput:{
          latency: 30, // Seconds to wait without input
        },
        cycle:{
          cycleValue: "00:00:30", // Interval value, for example 00:00:30
          repeatNumber: 1, // Number of repetitions, for example 3
          isInfiniteLoop: false, // Whether to repeat indefinitely
        }
      },
      action: {
        type: "prompt",
        prompt: "", // Prompt sends an instruction to the model
        random:{
          events:[""],
          type:"random",
          orderIndex:0,
        },
      },
      platform:"chat",
    },
    allBriefly:false,
    // Retained messaging platforms use independent settings below.

    telegramBotConfig: {
      TelegramAgent: 'super-model',
      memoryLimit: 20,
      separators: ['。', '\n', '？', '！'],
      reasoningVisible: false,
      quickRestart: true,
      enableTTS: false,
      bot_token: '',
      wakeWord: '',
      behaviorTargetChatIds: [],
    },
    isTelegramBotRunning: false,
    isTelegramStarting: false,
    isTelegramStopping: false,
    isTelegramReloading: false,
    discordBotConfig: {
      token: '',
      llm_model: 'super-model',
      memory_limit: 30,
      separators: ['。', '\n', '？', '！'],
      reasoning_visible: true,
      quick_restart: true,
      enable_tts: false,
      wakeWord: '',
      behaviorTargetChatIds: [],
    },
    isDiscordBotRunning: false,
    isDiscordStarting: false,
    isDiscordStopping: false,
    isDiscordReloading: false,
    isAudioSynthesizing: false, // Audio synthesis state
    audioChunksCount: 0,        // Number of generated audio chunks
    totalChunksCount: 0,        // Total audio chunks
    isConvertingAudio: false,    // Audio conversion state
    isConvertStopping: false, // Conversion stopping state
    ttsWebSocket: null,
    wsConnected: false,
    isVRMRunning: false,
    isVRMStarting: false,
    isTHAStarting: false,
    isSoulxStarting: false,
    showSoulxImageDialog: false,
    isVRMStopping: false,
    isVRMReloading: false,
    BotConfig: {
      imgHost_enabled: false,
      imgHost: 'easyImage2',
      EI2_base_url: '',
      EI2_api_key: '',
      github_repo_owner: "",
      github_repo_name: "",
      github_token: "",
      github_branch: "main"
    },
    deployTiles: [
      { id: 'table_pet', title: 'tablePet', icon: "fa-solid fa-user-ninja"},
      { id: 'THA_pet', title: 'THAPet', icon: "fa-solid fa-hat-wizard"},
      { id: 'vts_config', title: 'vtsbot', icon: "fa-solid fa-child"},
      { id: 'soulx_config', title: 'SoulXFlashHead', icon: "fa-solid fa-face-smile"},
      { id: 'live_stream', title: 'live_stream_bot', icon: "fa-solid fa-video"},
      { id: 'im_bot', title: 'imBot', icon: 'fa-solid fa-comment' },
      { id: 'read_bot', title: 'readBot', icon: "fa-solid fa-book-open-reader"}, 
      { id: 'translate_bot', title: 'translateBot', icon: "fa-solid fa-language"}, 
    ],
    activeImBotTab: 'telegram',
    sourceText: '',
    translatedText: '',
    isTranslating: false,
    targetLangSelected: 'system',   // System default
    readConfig: {
      longText: "",
      longTextList: [],
    },
    longTextListIndex: 0,
    selectedFile: null,
    isReadStarting: false,
    isReadStopping: false,
    isReadRunning: false,
    readState: {
      ttsChunks: [],
      audioChunks: [],
      chunks_voice: [], 
      ttsQueue: new Set(),
      currentChunk: 0,
      isPlaying: false
    },
    segmentEditBuffer: '',  // Temporary segment text editor
    segmentVoiceEditBuffer: [],  // Temporary segment voice editor
    activeSegmentIdx: -1,    // Index of the segment being edited manually
    _curAudio: null,        // Current Audio instance
    isReadingOnetext: false,
    liveConfig: {
      filterMode: 'danmaku_only',
      danmakuQueueLimit: 5,
      wakeWord: '',
      youtube_enabled: false,
      youtube_video_id:  "",
      youtube_api_key:  "",
      twitch_enabled: false,
      twitch_channel: "",
      twitch_access_token: "",
      danmakuVoice:"default",
      enableDanmakuTTS: false,
    },

    isSlackBotRunning: false,
    isSlackStarting: false,
    isSlackStopping: false,
    isSlackReloading: false,

    // Slack configuration object
    slackBotConfig: {
      bot_token: '',      // Slack xoxb token
      app_token: '',      // Slack xapp token (Socket Mode)
      llm_model: 'super-model',
      memory_limit: 30,
      separators: ['。', '\n', '？', '！'],
      reasoning_visible: true,
      quick_restart: true,
      enable_tts: false,
      wakeWord: '',
      behaviorTargetChatIds: [],
    },

    danmu: [], // Livestream chat message list
    liveWs: null, // Livestream websocket connection
    danmuProcessTimer: null, // Livestream message processing timer
    isProcessingDanmu: false, // Whether a livestream message is being processed
    shouldReconnectWs :false,
    isLiveRunning: false,
    isLiveStarting: false,
    isLiveStopping: false,
    isLiveReloading: false,
    stickerPacks: [],
    showStickerDialog: false,
    newStickerPack: {
      name: '',
      stickers: [],
      tags: []
    },
    dialogVisible: false,
    imageUrl: '',
    uploadedStickers: [], // Format: { uid: string, url: string, tags: string[] }
    isStarting: false,      // Starting state
    isStopping: false,      // Stopping state
    isReloading: false,     // Reloading state
    activeMemoryTab: 'config',
    activeBehaviorTab: 'config',
    activeMemoryTabName: 'autoUpdateSetting',
    activeMCPTab: 'config',
    activeCLITab: 'config',
    quickCreatePrompt: '',
    isGenerating: false, // Generation state
    quickCreateSystemPrompt: '',
    isSystemPromptGenerating: false, // System prompt generation state
    isQuickGenerating: false, // Quick response generation state
    memories: [],
    newMemory: {
      id: null,
      name: '',
      infer: false,
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
    },
    firstMes: '',
    alternateGreetings: [],
    showAddMemoryDialog: false,
    showMemoryDialog: false,
    memorySettings: {
      selectedMemory: null,
      is_memory: false,
      memoryLimit: 10,
      userName:'user',
      genericSystemPrompt: '',
    },
    textFiles: [],
    imageFiles: [],
    videoFiles: [],
    selectedFiles: [],      // Store unique_filename values
    selectedImages: [],
    allImagesChecked: false,
    indeterminateImages: false,
    selectedVideos: [],
    allVideosChecked: false,
    indeterminateVideos: false,
    subMenu: '', // Submenu state
    isWorldviewSettingsExpanded: true,
    isRandomSettingsExpanded: true,
    isBasicCharacterExpanded: true,
    text2imgSettings: {
      enabled: false,
      engine: 'pollinations',
      pollinations_model: 'flux',
      pollinations_width: 512,
      pollinations_height: 512,
      selectedProvider: null,
      vendor: 'OpenAI',
      model: '',
      base_url: '',
      api_key: '',
      size: '1024x1024',
    },
    agentTiles: [
      { 
        id: 'agents',
        title: 'agentSnapshot',
        icon: 'fa-solid fa-robot'
      },
      {
        id: 'mcp',
        title: 'mcpServers', 
        icon: 'fa-solid fa-server'
      },
      {
        id: 'a2a',
        title: 'a2aServers',
        icon: 'fa-solid fa-plug'
      },
      {
        id: 'llmTool',
        title: 'llmTools',
        icon: 'fa-solid fa-network-wired'
      },
      {
        id: 'customHttpTool',
        title: 'customHttpTool',
        icon: 'fa-solid fa-wifi'
      },
      {
        id: 'comfyui',
        title: 'ComfyUI',
        icon: 'fa-solid fa-palette'
      },
    ],
    comfyuiServers: ['http://127.0.0.1:8188'], // Default server
    comfyuiAPIkey: '',
    workflowDescription: "",
    activeComfyUIUrl: '',
    isConnecting: false,
    customHttpTools: [],  // Array of custom HTTP tools
    showCustomHttpToolForm: false,
    isInputExpanded: false,
    isChatInputActive: false, // Active (focused and expanded) chat input; when false, show one line and collapse model/view pills beside Send
    sidebarVisible: false,
    isMobile: false,
    searchKeyword: '',
    newCustomHttpTool: {
      enabled: true,
      name: '',
      description: '',
      url: '',
      method: 'GET',
      headers: '',
      body: ''
    },
    editingCustomHttpTool: false,

    searchQuery: '', // Search input value
    activeCategory: 'all', // Selected category: 'all' | 'local' | 'cloud'
    
    // Local and self-hosted provider list
    localVendors:[
      'llama.cpp','Ollama', 'Vllm', 'LMstudio','SGLang', 'xinference', 
      'LocalAI', 'ttswebui', 'Dify', 'newapi'
    ],

    // Recommended provider parameters loaded from vendor_params.js for UI suggestions
    vendorSuggestedParams: window.vendorSuggestedParams || {},
    vendorValues: [
      'custom','customAnthropic','OpenAIResponses', 'OpenAI', 'Anthropic', 'Gemini','Grok',
      'llama.cpp', 'Ollama','Vllm','LMstudio','SGLang','xinference',
      'Dify','LocalAI','ttswebui',
      'mistral','Github','openrouter','together','fireworks',
      'Nvidia','jina','perplexity'
    ],
    vendorLogoList: {},
    vendorAPIpage: {
      'OpenAI': 'https://platform.openai.com/api-keys',
      'Anthropic': 'https://console.anthropic.com/settings/keys',
      'Gemini': 'https://aistudio.google.com/app/apikey',
      'Grok': 'https://console.x.ai/',
      'mistral': 'https://console.mistral.ai/api-keys/',
      'openrouter': 'https://openrouter.ai/settings/keys',
      'together': 'https://api.together.ai/settings/api-keys',
      'fireworks': 'https://fireworks.ai/account/api-keys',
      'Nvidia': 'https://build.nvidia.com/',
      'jina': 'https://jina.ai/api-dashboard',
      'perplexity': 'https://www.perplexity.ai/settings/api',
      'Github': 'https://github.com/settings/tokens',
      'Ollama': 'https://ollama.com/',
      'Vllm': 'https://docs.vllm.ai/',
      'LMstudio': 'https://lmstudio.ai/docs/app',
      'SGLang': 'https://github.com/sgl-project/sglang',
      'xinference': 'https://inference.readthedocs.io/en/latest/index.html',
      'llama.cpp': 'https://github.com/ggml-org/llama.cpp',
      'Dify': 'http://localhost/apps',
      'LocalAI': 'https://localai.io/',
      'ttswebui': 'https://github.com/rsxdalv/TTS-WebUI'
    },
    MCPvendorValues:['MCP','awesome','docker'],
    MCPpage:{
      'MCP': 'https://github.com/modelcontextprotocol/servers',
      'awesome': 'https://github.com/punkpeye/awesome-mcp-servers',
      'docker': 'https://hub.docker.com/mcp'
    },
    MCPvendorLogoList: {},
    promptValues:['awesome', 'aiTool','leaked'],
    promptPage:{
      'awesome': 'https://github.com/f/awesome-chatgpt-prompts',
      'aiTool': 'https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools',
      'leaked': 'https://github.com/linexjlin/GPTs',
    },
    promptLogoList: {},
    cardValues: ['chub', 'janitorai','pygmalion'],
    cardPage:{
      'chub': 'https://chub.ai/',
      'janitorai': 'https://janitorai.com/',
      'pygmalion': 'https://pygmalion.chat/',
    },
    cardLogoList: {},
    newProviderTemp: {
      vendor: '',
      url: '',
      apiKey: '',
      modelId: '',
      models: [],
      modelsLoading: false,
      connectionStatus: null
    },
    systemlanguageOptions:[
      { value: 'auto', label: 'auto' }, 
      { value: 'en-US', label: 'English' },
    ],
    toneValues: [
      'normal', 'formal', 'friendly', 'humorous', 'professional',
      'sarcastic', 'ironic', 'flirtatious', 'tsundere', 'coquettish',
      'angry', 'sad', 'excited', 'refutational'
    ],
    showUploadDialog: false,
    agentTabActive: 'knowledge',
    files: [],
    images: [],
    currentUploadType: 'file',
    selectedCodeLang: 'python',
    previewClickHandler: null,
    dockerExamples: `git clone --branch agent-creation https://github.com/Blaco/super-agent-party.git
cd super-agent-party
docker build -t agent-creation:local .
docker run -d \\
  -p 127.0.0.1:3456:3456 \\
  -v ./super-agent-data:/app/data \\
  agent-creation:local`,
    dockerExamples2: `git clone --branch agent-creation https://github.com/Blaco/super-agent-party.git
cd super-agent-party
docker compose up --build -d`,
    browserEmbedCodeExamples: `<div id="super-agent-party">
  <iframe 
    src="${backendURL}/chat.html" 
    width="100%" 
    height="100%"
    frameborder="0" 
    allowfullscreen>
  </iframe>
  <p>Powered By<a href="https://github.com/heshengtao/super-agent-party">Super Agent Party</a></p>
</div>`,
    codeExamples: {
      python: `from openai import OpenAI
client = OpenAI(
  api_key="super-secret-key",
  base_url="${backendURL}/v1"
)
response = client.chat.completions.create(
  model="super-model",
  messages=[
      {"role": "user", "content": "What can you help me with?"}
  ]
)
print(response.choices[0].message.content)`,
    javascript: `import OpenAI from 'openai';
const client = new OpenAI({
  apiKey: "super-secret-key",
  baseURL: "${backendURL}/v1"
});
async function main() {
  const completion = await client.chat.completions.create({
      model: "super-model",
      messages: [
          { role: "user", content: "What can you help me with?" }
      ]
  });
  console.log(completion.choices[0].message.content);
}
main();`,
    curl: `curl ${backendURL}/v1/chat/completions \\
-H "Content-Type: application/json" \\
-H "Authorization: Bearer super-secret-key" \\
-d '{
  "model": "super-model",
  "messages": [
    {"role": "user", "content": "What can you help me with?"}
  ]
}'`
    },  
    llmTools: [],
    showLLMForm: false,
    editingLLM: null,
    newLLMTool: {
      name: '',
      type: 'openai',
      description: '',
      base_url: '',
      api_key: '',
      model: '',
      enabled: true
    },
    llmInterfaceTypes: [
      { value: 'openai', label: 'OpenAI' },
      { value: 'ollama', label: 'Ollama' }
    ],
    modelOptions: [],
    previewVisible: false,
    previewImageUrl: '',
    workflows: [], // Workflow file list
    showWorkflowUploadDialog: false, // Upload dialog visibility
    workflowFile: null, // Selected workflow file
    selectedTextInput: null,
    selectedImageInput: null,
    selectedTextInput2: null,
    selectedImageInput2: null,
    selectedSeedInput: null,
    selectedSeedInput2: null,
    textInputOptions: [], // Initialize as an empty array
    imageInputOptions: [], // Initialize as an empty array
    seedInputOptions: [], // Initialize as an empty array
    inAutoMode: false, // In-memory state, not persisted to settings
    vectorDialogVisible: false,
    vectorDialogMemoryId: '',
    vectorDialogMemoryName: '',
    vectorLoading: false,
    vectorTable: [],       // { idx, uuid, text, created_at, timetamp }
    editRowUuid: null,     // UUID of the row being edited
    editRowText: "",        // Text being edited
    editRowVisible: false,
    newVectorText: "",      // Text for a new memory entry
    nodeInstalled: false,   // Probe result
    nodeInstalling: false,
    nodeProgress: 0,
    nodeTimer: null,
    uvInstalled: false,
    uvInstalling: false,
    uvProgress: 0,
    uvTimer: null,
    dockerInstalled: false, 
    dockerInstalling: false,
    isReadInterruption: false,
    readSettings: {
      delay:2000
    },
    isReadPaused: false, 
    currentReadAudio: null,
    showLogDialog: false,
    logContent: '', // Log content
    systemVoices: [],        // Voice list retrieved from the backend
    isLoadingSystemVoices: false, // Loading state
    renderTimers: {}, // Per-message debounce timers
    // --- AI browser state ---
    browserTabs: [
        // Initialize one new tab by default
        { 
            id: Date.now(), 
            title: 'New Tab', 
            url: '', // An empty URL displays the welcome page
            favicon: '', 
            isLoading: false,
            canGoBack: false,
            canGoForward: false 
        }
    ],
    currentTabId: null, // Initialized in created or mounted
    urlInput: '',
    showEngineDropdown: false, // Dropdown visibility
    dropdownTimer: null, // Dropdown timer
    isSearchFocused: false,    // Search input focus styling
    searchEngine: 'bing', // 'bing' or 'google' or 'party'
    welcomeSearchQuery: '',
    showDownloadDropdown: false,
    downloads: [], // Download records { id, filename, totalBytes, receivedBytes, state, path, progress }
    dropdownTimer: null, 
    showBrowserChat: false,
    favorites: [],       // Bookmarks list
    showFavorites: true, // Welcome-page bookmark visibility
    searchEngineplaceholder:'',
    webviewPreloadPath: '', 
    isGroupMode: false,           // Whether group chat mode is active
    selectedGroupAgents: [], 
    showGroupSettingsDialog: false,
    voiceStack : ['default'], // Voice playback queue
    receivedMsgIds: new Set(), 
    lastProcessedContent: '', 
    approvalMap: {},
    isSubmitting: false,      // Dialog loading state
    isEditMode: false,        // Whether the dialog is in add or edit mode
    currentEditingMCPId: null, // MCP ID currently being added or edited
    activeDialogTab: 'config', 
    activeCLITab: 'config', // Existing active CLI tab
    skillsList: [],
    showAddSkillDialog: false,
    addSkillTab: 'github',
    newSkillUrl: '',
    isSkillInstalling: false,
    skillsPollingTimer: null, 
    showSkillPreviewDialog: false,
    skillPreviewLoading: false,
    renderedSkillContent: '',
    extensionsPollingTimer: null,
    skillsInProject: [], 
    projectSkillsDetails: [],
    showBehaviorDialog: false,     // Dialog visibility
    currentBehaviorIndex: -1,      // Index being edited; -1 means new entry
    tempBehavior: null,            // Temporary editing object to avoid modifying original data
    minLimit: { h: 0, m: 1, s: 0 },
    activeSideView: 'list', // 'list' | 'tasks' | 'workspace' | 'toolDetail'
    taskList: [],
    taskRefreshTimer: null,
    showCreateTaskDialog: false,
    isCreatingTask: false,
    showTaskResultDialog: false,
    selectedTaskResult: '',
    selectedTaskTitle: '',
    viewingTaskDetail: null,
    isDragging: false, // Dragging state
    isPttMode: false,      // Whether input uses push-to-talk mode
    isPttRecording: false, // Recording state
    isGlobalRecording: false, 
    workspaceTreeKey: 0, // Force the entire tree component to refresh
    expandedNodeKeys: [], // Preserve expanded folders across refreshes
    workspaceRefreshTimer: null, 
    workspaceTreeProps: {
      label: 'name',
      children: 'children',
      isLeaf: (data) => !data.isDirectory // Tell el-tree that non-directory entries are leaf nodes and cannot be expanded
    },
    loveSettings: {
      enabled: false,
      dimensions: [
          "love", 
          "familiarity"
      ],
      prompt: "Assess the user's tone, emotional context, and established character persona when updating relationship attributes.\n1. love: affection and closeness toward the user. Increase by 1 to 5 after kind, caring, or enjoyable interactions; decrease by 1 to 5 after cold, insulting, or upsetting interactions. Range: -50 to 50.\n2. familiarity: how well the character and user know each other. Increase gradually by 1 or 2 as they talk and exchange information; normally do not decrease. Range: 0 to 100.\nIf no current attribute values are provided, this is the first interaction. Choose reasonable initial values (for example, 0 to 10) based on the user's first message. Output only the requested attribute tags. Keep dialogue style consistent with relationship values and the character card."
    },
    // Relationship system UI state
    activeAffectionTab: 'config', // Active tab
    affectionRawData: {},         // Raw JSON returned by the backend, e.g. {"Alex": {love:1}, "Sam": {love:5}}
    affectionDataList: [],        // Convert to an array for table display
    affectionSearchQuery: '',     // Search field binding
    
    // Relationship system dialog state
    showAffectionDataDialog: false,
    isEditingAffection: false,
    currentAffectionForm: { userName: '' },
    // Diary system configuration
    diarySettings: {
      enabled: false,
      minMinutes: 10,
      maxMinutes: 60,
      quietStart: 23,
      quietEnd: 8,
      actions: {
        think: { enabled: true, weight: 4 },
        webSearch: { enabled: false, weight: 2 },
        knowledge: { enabled: false, weight: 2 },
        imMessage: { enabled: false, weight: 1 },
        browserControl: { enabled: false, weight: 1 },
        smartHome: { enabled: false, weight: 1 },
      },
      imTargets: [],
      pushToChat: true,
      prompt: "Write a private diary entry in the first person as the established AI character. Preserve the character card, personality, and continuity. Describe experiences and reflections naturally and sincerely. Do not invent events or memories.",
      chatIntegration: {
        enabled: false,
        maxEntries: 5,
      },
      chatSummary: {
        enabled: true,
        idleMinutes: 15,
      },
    },
    // Diary system UI state
    activeDiaryTab: 'config',
    diaryEntries: [],
    diarySearchQuery: '',
    diaryActionMeta: {
      think:     { icon: 'fa-solid fa-lightbulb',        type: 'info' },
      webSearch: { icon: 'fa-solid fa-globe',            type: 'success' },
      knowledge: { icon: 'fa-solid fa-book-open',        type: 'warning' },
      imMessage: { icon: 'fa-solid fa-paper-plane',      type: 'danger' },
      browserControl: { icon: 'fa-solid fa-compass',      type: '' },
      smartHome:  { icon: 'fa-solid fa-house-laptop',    type: 'success' },
      chatSummary: { icon: 'fa-solid fa-file-pen',       type: 'info' },
    },
    // Multiple diaries (one per character plus the default fallback)
    diaryBooks: [],
    diaryCurrentBook: 'default',
    // Diary details drawer
    diaryDetailVisible: false,
    diaryDetailEntry: null,
    isForceScrollToBottom: false,
    activeAgentTab: 'settings',

    isHeroInputFocus: false,
    isTopicGenerating: false,
    showOmniAgentDialog: false,

    showDisclaimerDialog: false,
    disclaimerAccepted: false,
    favoriteExtensionIds: JSON.parse(localStorage.getItem('favorite_extensions')) || [],
    isStartingASR: false,

    newTaskForm: {
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
    },  
    isEditing: false,
    editingTaskId: null,
    activeLogPanels: ['logs'],
    selectedTaskHistory: [],
    currentResultIdx: 0,
    extButtonVisible: false,  // Button visibility
    extMouseTimer: null,      // Mouse idle timer
    isVTSConnecting: false,
    
    isVTSStarting: false, // Button loading state
    vtsOnline: false, 
    VTSConfig: {
      enabled: false,
      url: 'ws://127.0.0.1:8001',
      enabledExpressions: true,
      enabledMotions: true
    },
    acpSettings: {
      agent: 'claude',            // Default CLI agent
      permissionMode: 'default',  // Default permission mode
      model: '',                  // Optional model override
      extraEnv: '',              // Additional environment variables
    },
    
    // ACPX state
    acpxStatus: null,            // null | 'available' | 'unavailable'
    checkingAcpx: false,         // Check in progress
    openedExtensions:[], 
    searchExtensionQuery: '',
    searchManageExtensionQuery: '', // Main-page extension search
    searchRemotePluginQuery: '',    // Remote plugin search in the dialog
    scrollPending: false,              // Scroll throttling flag
    _streamUpdateTimer: null,          // Batched streaming-text update timer
    _streamTextBuffer: '',             // Streaming text buffer
    _streamTargetMsg: null,            // Message currently being updated by the stream
    activeToolBlock: null,        // Currently inspected block { messageIndex, blockIndex, block }
    activeToolBlockMessage: null, // Reference to the containing message
    customDataPath: "",
};
