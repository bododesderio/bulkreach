/**
 * Renders a schema.org JSON-LD block. Data comes only from our own trusted
 * builders / CMS content — never from untrusted third-party input — so the
 * serialized JSON is safe to inline. `<` is escaped to keep the script tag
 * from being broken out of by any stray sequence in the content.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
