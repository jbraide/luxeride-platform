// Renders a JSON-LD block.
//
// The escaping is not defensive decoration: product copy is authored text, and
// an unescaped "</script>" inside it would end the tag early and let the
// remainder be parsed as markup. Escaping "<" to the "<" escape closes that
// hole without changing the decoded JSON value.

export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Safe by construction: the payload is JSON.stringify'd below with "<"
      // escaped, so no value in it can terminate the script element.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
