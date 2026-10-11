// A template is re-created on every navigation, which gives each page a soft fade-in.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
