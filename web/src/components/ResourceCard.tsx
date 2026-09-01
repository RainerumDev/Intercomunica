import type { ReactNode } from "react";
import type { SharedResourceDraft } from "../types";
import { resourceCardFallback } from "./resourceForm";

interface Props {
  resource: SharedResourceDraft;
  children?: ReactNode;
  linked?: boolean;
}

export default function ResourceCard({ resource, children, linked = true }: Props) {
  const showImage = resource.previewEnabled && Boolean(resource.previewImageUrl);
  const content = (
    <>
      <div className="relative grid h-36 place-items-center overflow-hidden bg-gray-100 px-6 text-center text-sm font-medium text-gray-500">
        <span>{resourceCardFallback(resource)}</span>
        {showImage && (
          <img
            key={resource.previewImageUrl}
            src={resource.previewImageUrl ?? undefined}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={(event) => event.currentTarget.classList.add("hidden")}
          />
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-gray-900">{resource.title || "Titolo della risorsa"}</h3>
          {resource.isGlobal && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
              Per tutti
            </span>
          )}
        </div>
        {resource.description && (
          <p className="mt-2 line-clamp-3 text-sm text-gray-600">{resource.description}</p>
        )}
      </div>
    </>
  );

  return (
    <article className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      {linked ? (
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-inherit no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-700"
        >
          {content}
        </a>
      ) : (
        <div>{content}</div>
      )}
      {children && <div className="border-t border-gray-100 p-3">{children}</div>}
    </article>
  );
}
