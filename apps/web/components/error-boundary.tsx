import React from "react"

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive"
        >
          <p className="text-sm font-medium">Something went wrong. Please refresh and try again.</p>
        </div>
      )
    }
    return this.props.children
  }
}