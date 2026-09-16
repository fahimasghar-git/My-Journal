import JournalApp from "./JournalApp";
import AppErrorBoundary from "./AppErrorBoundary";

export default function Home() {
  return <AppErrorBoundary><JournalApp /></AppErrorBoundary>;
}
