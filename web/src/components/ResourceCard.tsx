import { useState, type ReactNode } from "react";
import type { SharedResource, SharedResourceDraft } from "../types";
import { resourceCardFallback } from "./resourceForm";

interface Props {
  resource: SharedResource | SharedResourceDraft;
  children?: ReactNode;
  linked?: boolean;
}

function ResourcePreview({ imageSrc, fallback }: { imageSrc: string | null; fallback: string }) {
  const [imageFailed, setImageFailed] = useState(false);

  return imageSrc && !imageFailed ? (
    <img
      src={imageSrc}
      alt=""
      loading="lazy"
      decoding="async"
      className="resource-card__image"
      onError={() => setImageFailed(true)}
    />
  ) : (
    <span>{fallback}</span>
  );
}

export default function ResourceCard({ resource, children, linked = true }: Props) {
  const imageSrc = "id" in resource && resource.hasPreviewImage
    ? `/api/resources/${encodeURIComponent(resource.id)}/preview-image?v=${encodeURIComponent(resource.updatedAt)}`
    : null;
  const content = (
    <>
      <div className="resource-card__preview">
        <ResourcePreview
          key={imageSrc ?? "resource-fallback"}
          imageSrc={imageSrc}
          fallback={resourceCardFallback(resource)}
        />
      </div>
      <div className="resource-card__body">
        <div className="flex items-start justify-between gap-3">
          <h3 className="resource-card__title">{resource.title || "Titolo della risorsa"}</h3>
          {resource.isGlobal && (
            <span className="badge badge--global">Per tutti</span>
          )}
        </div>
        {resource.description && (
          <p className="resource-card__description line-clamp-3">{resource.description}</p>
        )}
      </div>
    </>
  );

  return (
    <article className="resource-card surface-card surface-card--interactive">
      {linked ? (
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className="resource-card__link"
        >
          {content}
        </a>
      ) : (
        <div>{content}</div>
      )}
      {children && <div className="resource-card__actions">{children}</div>}
    </article>
  );
}
