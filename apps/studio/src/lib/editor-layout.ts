import type { EditDocument, Layout, Project } from '../types';

export function applyLayout(document: EditDocument, layout: Layout, project?: Project) {
  document.layout = layout;
  if (!project) {
    return;
  }
  const ratio = layout === 'square' ? 1 : layout === 'landscape' ? 16 / 9 : 9 / 16;
  const sourceRatio = project.width / project.height;
  const width = Math.min(1, ratio / sourceRatio);
  const height = Math.min(1, sourceRatio / ratio);
  document.crop = {
    width,
    height,
    x: (1 - width) / 2,
    y: (1 - height) / 2,
  };
  document.keyframes = [];
}
