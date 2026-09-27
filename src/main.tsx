import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';

class CourtyardBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="recovery-screen"><h1>庭院存档暂时无法打开</h1><p>可以先导出原始记录，再清除当前存档重新进入。</p><div>
      <button onClick={() => {
        const raw = localStorage.getItem('golden-courtyard.world.v1')
          ?? localStorage.getItem('golden-courtyard.world.v1.corrupt')
          ?? localStorage.getItem('golden-courtyard.world.v1.recovered');
        if (!raw) return;
        const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = '黄金庭院-原始存档.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>导出原始存档</button>
      <button onClick={() => {
        if (!window.confirm('已导出原始存档了吗？清除当前存档后将重新开始。')) return;
        localStorage.removeItem('golden-courtyard.world.v1');
        location.reload();
      }}>清除当前存档</button>
    </div></main>;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CourtyardBoundary><App /></CourtyardBoundary>
  </React.StrictMode>,
);
