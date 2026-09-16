"use client";

import React from "react";

type ErrorDetails = { message: string; stack?: string; source?: string };

const reportedErrors = new Map<string, number>();

function reportClientError(details: ErrorDetails) {
  const signature = `${details.message}\n${details.source ?? ""}`.slice(0, 2_500);
  const now = Date.now();
  const lastReported = reportedErrors.get(signature) ?? 0;
  if (now - lastReported < 30_000) return;
  reportedErrors.set(signature, now);
  if (reportedErrors.size > 30) {
    for (const [key, timestamp] of reportedErrors) {
      if (now - timestamp > 300_000) reportedErrors.delete(key);
    }
  }
  const payload = JSON.stringify({
    message: details.message.slice(0, 2_000),
    stack: details.stack?.slice(0, 8_000) ?? "",
    source: details.source?.slice(0, 500) ?? "",
    path: window.location.pathname,
    userAgent: navigator.userAgent.slice(0, 500),
    occurredAt: new Date().toISOString(),
  });
  try {
    if (navigator.sendBeacon("/api/client-errors", new Blob([payload], { type: "application/json" }))) return;
  } catch {
    // Fall through to a keepalive request.
  }
  void fetch("/api/client-errors", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
}

export default class AppErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };

  private onWindowError = (event: ErrorEvent) => {
    reportClientError({ message: event.message || "Unhandled browser error", stack: event.error?.stack, source: event.filename });
  };

  private onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    reportClientError({
      message: reason instanceof Error ? reason.message : String(reason ?? "Unhandled promise rejection"),
      stack: reason instanceof Error ? reason.stack : undefined,
      source: "unhandledrejection",
    });
  };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidMount() {
    window.addEventListener("error", this.onWindowError);
    window.addEventListener("unhandledrejection", this.onUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener("error", this.onWindowError);
    window.removeEventListener("unhandledrejection", this.onUnhandledRejection);
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportClientError({ message: error.message, stack: `${error.stack ?? ""}\n${info.componentStack ?? ""}`, source: "react" });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="loading-screen error-screen">
      <div className="notebook-logo">!</div>
      <h1>The journal needs to reopen</h1>
      <p>Your saved work is safe. Reopen the current version to continue.</p>
      <button type="button" onClick={() => window.location.reload()}>Reopen journal</button>
    </main>;
  }
}
