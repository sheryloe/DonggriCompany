import { Component, type ErrorInfo, type ReactNode } from "react";

type AvatarLayerBoundaryProps = {
  children: ReactNode;
};

type AvatarLayerBoundaryState = {
  hasError: boolean;
};

export class AvatarLayerBoundary extends Component<AvatarLayerBoundaryProps, AvatarLayerBoundaryState> {
  public override state: AvatarLayerBoundaryState = {
    hasError: false
  };

  public static getDerivedStateFromError(): AvatarLayerBoundaryState {
    return {
      hasError: true
    };
  }

  public override componentDidCatch(_error: Error, _errorInfo: ErrorInfo): void {
    // Avatar presentation failures must not block operational widgets.
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <section className="card avatar-shell avatar-shell-fallback" role="alert">
          <header>
            <h2>Office Agent</h2>
          </header>
          <p className="error">Avatar layer is temporarily unavailable.</p>
          <p className="hint">Fallback panels remain active below for all operations.</p>
        </section>
      );
    }

    return this.props.children;
  }
}
