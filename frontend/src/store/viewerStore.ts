import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { VolumeData } from '../types/nifti.d';

interface ViewerState {

  caseId: string;
  model: string;
  availableCases: string[];
  availableModels: string[];

  mri: VolumeData | null;
  pred: VolumeData | null;
  gt: VolumeData | null;

  sliceAxial: number;
  sliceCor: number;
  sliceSag: number;
  opacity: number;
  angleX: number;
  angleY: number;
  autoRotate: boolean;
  threshold3d: number;

  metrics: Record<string, number> | null;

  aiBackground: string;

  aiModel: string;
  availableAiModels: { id: string; displayName: string }[];

  setCaseId: (id: string) => void;
  setModel: (m: string) => void;
  setAvailableCases: (c: string[]) => void;
  setAvailableModels: (m: string[]) => void;
  setMri: (v: VolumeData | null) => void;
  setPred: (v: VolumeData | null) => void;
  setGt: (v: VolumeData | null) => void;
  setSlice: (axis: 'axial' | 'cor' | 'sag', v: number) => void;
  setOpacity: (v: number) => void;
  setAngle: (x: number, y: number) => void;
  setAutoRotate: (v: boolean) => void;
  setThreshold3d: (v: number) => void;
  setMetrics: (m: Record<string, number> | null) => void;
  setAiBackground: (s: string) => void;
  setAiModel: (m: string) => void;
  setAvailableAiModels: (m: { id: string; displayName: string }[]) => void;
}

export const useViewerStore = create<ViewerState>()(
  persist(
    (set) => ({
      caseId: '',
      model: '',
      availableCases: [],
      availableModels: [],
      mri: null,
      pred: null,
      gt: null,
      sliceAxial: 78,
      sliceCor: 78,
      sliceSag: 78,
      opacity: 0.45,
      angleX: 0,
      angleY: 0,
      autoRotate: true,
      threshold3d: 0.15,
      metrics: null,
      aiBackground: '',
      aiModel: '',
      availableAiModels: [],

      setCaseId: (id) => set({ caseId: id }),
      setModel: (m) => set({ model: m }),
      setAvailableCases: (c) => set({ availableCases: c }),
      setAvailableModels: (m) => set({ availableModels: m }),
      setMri: (v) => set({ mri: v }),
      setPred: (v) => set({ pred: v }),
      setGt: (v) => set({ gt: v }),
      setSlice: (axis, v) => {
        if (axis === 'axial') set({ sliceAxial: v });
        else if (axis === 'cor') set({ sliceCor: v });
        else set({ sliceSag: v });
      },
      setOpacity: (v) => set({ opacity: v }),
      setAngle: (x, y) => set({ angleX: x, angleY: y }),
      setAutoRotate: (v) => set({ autoRotate: v }),
      setThreshold3d: (v) => set({ threshold3d: v }),
      setMetrics: (m) => set({ metrics: m }),
      setAiBackground: (s) => set({ aiBackground: s }),
      setAiModel: (m) => set({ aiModel: m }),
      setAvailableAiModels: (m) => set({ availableAiModels: m }),
    }),
    {
      name: 'smartmed-viewer-settings',

      partialize: (state) => ({
        caseId: state.caseId,
        model: state.model,
        opacity: state.opacity,
        autoRotate: state.autoRotate,
        threshold3d: state.threshold3d,
        sliceAxial: state.sliceAxial,
        sliceCor: state.sliceCor,
        sliceSag: state.sliceSag,
        aiModel: state.aiModel,
      }),
    }
  )
);
