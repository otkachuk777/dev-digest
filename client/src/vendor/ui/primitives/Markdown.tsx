import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/* Tailwind preflight resets headings, lists and tables to plain text, so every
   block element needs an explicit style here (inline, per the styling rules). */
const heading = (fontSize: string): React.CSSProperties => ({
  fontSize,
  fontWeight: 650,
  color: "var(--text-primary)",
  margin: "18px 0 8px",
  lineHeight: 1.3,
});
const cell: React.CSSProperties = {
  border: "1px solid var(--border)",
  padding: "6px 10px",
  textAlign: "left",
  verticalAlign: "top",
};

/** Markdown renderer (replaces prototype mdLite). Inline + GFM. */
export function Markdown({
  children,
  noRemoteImages,
}: {
  children?: string | null;
  /** Untrusted content: never emit an <img> (no request to a remote host); show alt text / a link. */
  noRemoteImages?: boolean;
}) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          h1: ({ children }) => <h1 style={heading("1.4em")}>{children}</h1>,
          h2: ({ children }) => <h2 style={heading("1.2em")}>{children}</h2>,
          h3: ({ children }) => <h3 style={heading("1.05em")}>{children}</h3>,
          ul: ({ children }) => (
            <ul style={{ listStyle: "disc", paddingLeft: 22, margin: "0 0 10px" }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ listStyle: "decimal", paddingLeft: 22, margin: "0 0 10px" }}>{children}</ol>
          ),
          li: ({ children }) => <li style={{ margin: "2px 0" }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote
              style={{
                borderLeft: "3px solid var(--border-strong)",
                paddingLeft: 12,
                margin: "0 0 10px",
                color: "var(--text-muted)",
              }}
            >
              {children}
            </blockquote>
          ),
          hr: () => (
            <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "14px 0" }} />
          ),
          table: ({ children }) => (
            <div style={{ overflowX: "auto", margin: "0 0 12px" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th style={{ ...cell, fontWeight: 650, color: "var(--text-primary)", background: "var(--bg-hover)" }}>
              {children}
            </th>
          ),
          td: ({ children }) => <td style={cell}>{children}</td>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          pre: ({ children }) => (
            <pre
              className="mono"
              style={{
                fontSize: "0.9em",
                padding: "10px 12px",
                borderRadius: 6,
                background: "var(--bg-hover)",
                overflowX: "auto",
                margin: "0 0 10px",
              }}
            >
              {children}
            </pre>
          ),
          code: ({ children, className }) =>
            // Fenced blocks carry a language class or a newline; the <pre> above styles them.
            className || String(children).includes("\n") ? (
              <code className="mono">{children}</code>
            ) : (
              <code
                className="mono"
                style={{
                  fontSize: "0.92em",
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "var(--bg-hover)",
                  color: "var(--accent-text)",
                }}
              >
                {children}
              </code>
            ),
          ...(noRemoteImages && {
            img: ({ src, alt }) =>
              alt ? (
                <span>{alt}</span>
              ) : typeof src === "string" ? (
                <a href={src} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
                  {src}
                </a>
              ) : null,
          }),
          a: ({ children, href }) => (
            <a href={href} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
