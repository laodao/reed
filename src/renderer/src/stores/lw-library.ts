/**
 * 设定资产库 store（世界观库 + 角色 IP 库，2026-09-24 P0）
 * 只缓存列表；详情/编辑直调 IPC（照 stores/knowledge-base.ts 的轻缓存先例）。
 */
import { defineStore } from 'pinia'
import type { IpCharacter, World } from '@shared/types/lw-library.types'

export const useLwLibraryStore = defineStore('lw-library', {
  state: () => ({
    worlds: [] as World[],
    worldsLoading: false,
    worldsLoaded: false,
    ipCharacters: [] as IpCharacter[],
    ipsLoading: false,
    ipsLoaded: false,
  }),
  actions: {
    async fetchWorlds(force = false) {
      if (this.worldsLoaded && !force) return
      this.worldsLoading = true
      try {
        this.worlds = await window.electronAPI.library.worldList()
        this.worldsLoaded = true
      } finally {
        this.worldsLoading = false
      }
    },
    async fetchIps(force = false) {
      if (this.ipsLoaded && !force) return
      this.ipsLoading = true
      try {
        this.ipCharacters = await window.electronAPI.library.ipList()
        this.ipsLoaded = true
      } finally {
        this.ipsLoading = false
      }
    },
    invalidate() {
      this.worldsLoaded = false
      this.ipsLoaded = false
    },
  },
})
