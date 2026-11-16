import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type LauncherApi, type LauncherState } from '../shared/types'

const api: LauncherApi = {
  getState: () => ipcRenderer.invoke(IPC.GET_STATE),
  listProfiles: () => ipcRenderer.invoke(IPC.LIST_PROFILES),
  addAccount: (ompProfile) => ipcRenderer.invoke(IPC.ADD_ACCOUNT, ompProfile),
  updateAccount: (accountId, update) => ipcRenderer.invoke(IPC.UPDATE_ACCOUNT, accountId, update),
  removeAccount: (accountId) => ipcRenderer.invoke(IPC.REMOVE_ACCOUNT, accountId),
  renameProfile: (accountId, newName) => ipcRenderer.invoke(IPC.RENAME_PROFILE, accountId, newName),
  signIn: (ompProfile) => ipcRenderer.invoke(IPC.SIGN_IN, ompProfile),
  signOut: (ompProfile) => ipcRenderer.invoke(IPC.SIGN_OUT, ompProfile),
  open: (accountId) => ipcRenderer.invoke(IPC.OPEN, accountId),
  stop: (accountId) => ipcRenderer.invoke(IPC.STOP, accountId),
  restart: (accountId) => ipcRenderer.invoke(IPC.RESTART, accountId),
  updateSettings: (update) => ipcRenderer.invoke(IPC.UPDATE_SETTINGS, update),
  onState: (listener) => {
    const handler = (_event: unknown, state: LauncherState): void => listener(state)
    ipcRenderer.on(IPC.EVENT_STATE, handler)
    return () => {
      ipcRenderer.removeListener(IPC.EVENT_STATE, handler)
    }
  },
}

contextBridge.exposeInMainWorld('launcher', api)
