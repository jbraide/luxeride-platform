import type { ComparisonTableProps } from "@/data/funnel/sections";

/**
 * A text-only comparison of materials or approaches (Requirement 5).
 *
 * Every cell is a string supplied by the page's content module — there is no price
 * field and no image field, so this component cannot introduce a figure or a
 * photograph the rest of the page does not have. The wrapper scrolls horizontally
 * rather than squeezing three columns onto a phone, because a comparison that has to
 * be zoomed into is not a comparison.
 *
 * The first column is the row's label (`scope="row"`), so the table reads correctly
 * with a screen reader that announces a cell together with its row.
 */
export default function ComparisonTable({ columns, rows }: ComparisonTableProps) {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-5xl px-5 py-12">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-3 pr-4 text-left">
                  <span className="sr-only">Attribute</span>
                </th>
                {columns.map((column) => (
                  <th key={column} scope="col" className="px-4 py-3 text-left font-display font-semibold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-border/60 align-top">
                  <th scope="row" className="py-3 pr-4 text-left font-medium text-fg/85">
                    {row.label}
                  </th>
                  {row.cells.map((cell, index) => (
                    <td key={index} className="px-4 py-3 text-fg-muted">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
