const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('accountPicker', {
  select: (accountId, remember) => ipcRenderer.send('account-selected', { accountId, remember }),
});
