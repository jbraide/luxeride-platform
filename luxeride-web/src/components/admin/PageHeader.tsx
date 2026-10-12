import type { ReactNode } from "react";

import { PAGE_META, PAGE_TITLE } from "./ui";

/**
 * THE TOP OF EVERY SCREEN: a title, one line of what it is, and at most one primary
 * action on the right.
 *
 * The console's screens each invented their own header — some an `<h2>` with a paragraph
 * under it, some a title and a count on opposite sides, some with the action buried in
 * the body. Real visitors of a back-office (here: one operator) benefit from the title
 * and the next thing to do being in the same place every time, so they stop re-reading
 * the screen to find them.
 *
 * `actions` is a slot rather than a `primaryHref` prop because the action is not always
 * a link — some are the submit button of a form that already exists further down the
 * page, and a prop cannot express "the button you are about to build".
 */
export default function PageHeader({
  title,
  meta,
  actions,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className={PAGE_TITLE}>{title}</h1>
        {meta ? <p className={PAGE_META}>{meta}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
