import { Component, type ReactNode } from 'react';

type Props = { moduleKey: string; children: ReactNode; onReset?: () => void };
type State = { failed: boolean };

/** Error boundary: a failure inside one generator never takes down the editor. */
export class ModuleBreaker extends Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error('[Generar breaker]', this.props.moduleKey, error); }
  reset = () => { this.setState({ failed: false }); this.props.onReset?.(); };
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="generar-breaker"><h2>Módulo aislado</h2><p>Este módulo se detuvo sin afectar el resto del editor.</p><button onClick={this.reset}>Reintentar</button></div>;
  }
}
