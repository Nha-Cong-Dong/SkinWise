import type { ProductSummary } from '../api'
import { APPLICATION_LABELS } from '../labels'
import { productKeyFor, type RoutineActions } from '../routine'
import { GroupChips } from './GroupChips'

type Props = {
  product: ProductSummary
  actions: RoutineActions
  /** The size printed with the barcode that found the product. */
  size?: string | null
}

/** A sample product with its active groups and a button to add it (search results, barcode hits). */
export function SampleProduct({ product: p, actions, size }: Props) {
  const isAdded = actions.routine.products.some((x) => x.key === productKeyFor(p.id))
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-mute">
          {p.brand}
          {p.application && <span className="ml-2">{APPLICATION_LABELS[p.application]}</span>}
        </p>
        <p className="text-sm leading-snug font-medium">
          {p.name}
          {size && <span className="font-normal text-ink-mute"> · {size}</span>}
        </p>
        <div className="mt-1">
          <GroupChips codes={p.groups} empty="Không có hoạt chất trong danh sách theo dõi" />
        </div>
      </div>
      <button
        disabled={isAdded}
        onClick={() =>
          actions.addProduct({ name: p.name, brand: p.brand, productId: p.id, inci: null, groups: p.groups })
        }
        className="shrink-0 rounded-full bg-ink px-3.5 py-1.5 text-sm font-medium text-white hover:bg-link disabled:bg-paper disabled:text-ink-mute"
      >
        {isAdded ? 'Đã thêm' : 'Thêm'}
      </button>
    </div>
  )
}
