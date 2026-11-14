import { create } from 'zustand';

export type Transfer = {
  id: string;
  label: string;
  message: string;
  progress?: number;
  status: 'running' | 'completed' | 'failed';
};

type ActivityState = {
  transfers: Transfer[];
  start: (label: string, message: string) => string;
  update: (id: string, progress: number, message?: string) => void;
  finish: (id: string, message?: string) => void;
  fail: (id: string, message: string) => void;
  dismiss: (id: string) => void;
};

export const useActivity = create<ActivityState>((set) => ({
  transfers: [],
  start: (label, message) => {
    const id = crypto.randomUUID();
    set((state) => ({
      transfers: [...state.transfers, { id, label, message, status: 'running' }],
    }));
    return id;
  },
  update: (id, progress, message) => {
    set((state) => ({
      transfers: state.transfers.map((transfer) =>
        transfer.id === id
          ? { ...transfer, progress, message: message ?? transfer.message }
          : transfer,
      ),
    }));
  },
  finish: (id, message) => {
    set((state) => ({
      transfers: message
        ? state.transfers.map((transfer) =>
            transfer.id === id
              ? { ...transfer, message, progress: 1, status: 'completed' }
              : transfer,
          )
        : state.transfers.filter((transfer) => transfer.id !== id),
    }));
  },
  fail: (id, message) => {
    set((state) => ({
      transfers: state.transfers.map((transfer) =>
        transfer.id === id ? { ...transfer, message, status: 'failed' } : transfer,
      ),
    }));
  },
  dismiss: (id) => {
    set((state) => ({ transfers: state.transfers.filter((transfer) => transfer.id !== id) }));
  },
}));
