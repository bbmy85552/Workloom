import { create } from 'zustand';
import type { ReactNode } from 'react';
import { readBrowserValue, writeBrowserValue } from '../lib/browserStorage';

export type DialogKind = 'alert' | 'confirm' | 'prompt';

export interface DialogState {
  id: number;
  kind: DialogKind;
  title?: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  /** 仅 alert: 用等宽字体展示 message,并提供"复制"按钮 */
  mono?: boolean;
  /** 仅 prompt */
  defaultValue?: string;
  placeholder?: string;
  resolve: (value: { ok: boolean; value?: string }) => void;
}

export interface ConfirmDialogOptions {
  title?: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export interface AlertDialogOptions {
  title?: string;
  message: ReactNode;
  confirmText?: string;
  mono?: boolean;
}

export interface PromptDialogOptions {
  title?: string;
  message: ReactNode;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
}

interface UiState {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebar: (v: boolean) => void;
  toggleCollapsed: () => void;
  setCollapsed: (v: boolean) => void;
  toast: { id: number; type: 'info' | 'error' | 'success'; text: string } | null;
  showToast: (text: string, type?: 'info' | 'error' | 'success') => void;
  dismissToast: () => void;
  dialog: DialogState | null;
  confirmDialog: (opts: ConfirmDialogOptions) => Promise<boolean>;
  alertDialog: (opts: AlertDialogOptions) => Promise<void>;
  promptDialog: (opts: PromptDialogOptions) => Promise<string | null>;
  resolveDialog: (id: number, result: { ok: boolean; value?: string }) => void;
}

const SIDEBAR_KEY = 'workloom.sidebarCollapsed';
const LEGACY_SIDEBAR_KEY = 'jianji.sidebarCollapsed';
const initialCollapsed = readBrowserValue(SIDEBAR_KEY, LEGACY_SIDEBAR_KEY) === '1';

let toastId = 0;
let dialogId = 0;
export const useUiStore = create<UiState>((set, get) => ({
  sidebarOpen: false,
  sidebarCollapsed: initialCollapsed,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebar: (v) => set({ sidebarOpen: v }),
  toggleCollapsed: () =>
    set((s) => {
      const next = !s.sidebarCollapsed;
      writeBrowserValue(SIDEBAR_KEY, next ? '1' : '0', LEGACY_SIDEBAR_KEY);
      return { sidebarCollapsed: next };
    }),
  setCollapsed: (v) => {
    writeBrowserValue(SIDEBAR_KEY, v ? '1' : '0', LEGACY_SIDEBAR_KEY);
    set({ sidebarCollapsed: v });
  },
  toast: null,
  showToast: (text, type = 'info') => {
    const id = ++toastId;
    set({ toast: { id, type, text } });
    setTimeout(() => {
      set((s) => (s.toast?.id === id ? { toast: null } : {}));
    }, 3000);
  },
  dismissToast: () => set({ toast: null }),
  dialog: null,
  confirmDialog: (opts) =>
    new Promise<boolean>((resolve) => {
      const id = ++dialogId;
      set({
        dialog: {
          id,
          kind: 'confirm',
          title: opts.title,
          message: opts.message,
          confirmText: opts.confirmText,
          cancelText: opts.cancelText,
          danger: opts.danger,
          resolve: (r) => resolve(r.ok),
        },
      });
    }),
  alertDialog: (opts) =>
    new Promise<void>((resolve) => {
      const id = ++dialogId;
      set({
        dialog: {
          id,
          kind: 'alert',
          title: opts.title,
          message: opts.message,
          confirmText: opts.confirmText,
          mono: opts.mono,
          resolve: () => resolve(),
        },
      });
    }),
  promptDialog: (opts) =>
    new Promise<string | null>((resolve) => {
      const id = ++dialogId;
      set({
        dialog: {
          id,
          kind: 'prompt',
          title: opts.title,
          message: opts.message,
          confirmText: opts.confirmText,
          cancelText: opts.cancelText,
          defaultValue: opts.defaultValue,
          placeholder: opts.placeholder,
          resolve: (r) => resolve(r.ok ? r.value ?? '' : null),
        },
      });
    }),
  resolveDialog: (id, result) => {
    const cur = get().dialog;
    if (cur && cur.id === id) {
      cur.resolve(result);
      set({ dialog: null });
    }
  },
}));
