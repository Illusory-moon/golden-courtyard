import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { activeBranch, readRawWorld, writeWorld } from './storage';
import { createWorld } from './world';
import './styles.css';

class CourtyardBoundary extends React.Component<React.PropsWithChildren, { failed: boolean; error: string }> {
  state = { failed: false, error: '' };

  static getDerivedStateFromError() { return { failed: true }; }

  async exportRaw() {
    try {
      const raw = await readRawWorld(activeBranch());
      if (raw == null) throw new Error('没有找到可导出的原始存档。');
      const content = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = '黄金庭院-原始存档.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { this.setState({ error: error instanceof Error ? error.message : '导出失败。' }); }
  }

  async clear() {
    if (!window.confirm('这会覆盖当前分支。请先导出原始存档，确定继续吗？')) return;
    try {
      await writeWorld(activeBranch(), createWorld());
      location.reload();
    } catch (error) { this.setState({ error: error instanceof Error ? error.message : '重建失败。' }); }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="recovery-screen"><h1>庭院存档暂时无法打开</h1><p>可以先导出原始记录，再重建当前分支。</p><div>
      <button onClick={() => void this.exportRaw()}>导出原始存档</button>
      <button onClick={() => void this.clear()}>重建当前分支</button>
    </div>{this.state.error && <p role="alert">{this.state.error}</p>}</main>;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CourtyardBoundary><App /></CourtyardBoundary>
  </React.StrictMode>,
);
