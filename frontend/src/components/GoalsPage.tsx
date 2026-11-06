import { useContext, useEffect, useState } from 'react'
import { api, type Goal, type GoalItem, type GoalsResponse, type Source } from '../api'
import { productsWithGroup, useSelectedGoals } from '../goals'
import { GroupsContext, useGroupName } from '../groups'
import { href } from '../router'
import type { LabelGroups, MyProduct, Routine } from '../routine'
import { Dialog } from './Dialog'
import { Notice } from './Notice'

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'done'; data: GoalsResponse }

/**
 * Skin goals: groups of actives often used for a goal and reviewed reading, each with its
 * sources. Titles and bodies are shown verbatim. The chosen goals stay in this browser.
 */
export function GoalsPage({ routine, found }: { routine: Routine; found: Map<string, LabelGroups> }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [open, setOpen] = useState<GoalItem | null>(null)
  const data = state.kind === 'done' ? state.data : null
  const { selected, toggle } = useSelectedGoals(data ? data.goals.map((g) => g.code) : null)

  useEffect(() => {
    let live = true
    api.goals().then(
      (d) => live && setState({ kind: 'done', data: d }),
      () => live && setState({ kind: 'error' }),
    )
    return () => {
      live = false
    }
  }, [attempt])

  const chosen = data ? data.goals.filter((g) => selected.includes(g.code)) : []

  return (
    <div className="space-y-10">
      <section aria-labelledby="goals-title">
        <h1 id="goals-title" className="text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl">
          Mục tiêu da
        </h1>
        <p className="mt-3 max-w-[38rem] text-base leading-relaxed text-ink-soft">
          Chọn mục tiêu da hiện tại để xem các nhóm hoạt chất thường dùng và thông tin có nguồn. Lựa chọn của bạn chỉ
          lưu trên trình duyệt này, không gửi lên máy chủ.
        </p>

        <div className="mt-6 space-y-4">
          {data && <Notice>{data.notice_vi}</Notice>}
          {state.kind === 'loading' && <p className="text-sm text-ink-mute">Đang tải…</p>}
          {state.kind === 'error' && (
            <p className="text-sm text-avoid-ink">
              Không tải được thông tin mục tiêu.{' '}
              <button
                onClick={() => {
                  setState({ kind: 'loading' })
                  setAttempt((n) => n + 1)
                }}
                className="text-link underline underline-offset-2"
              >
                Thử lại
              </button>
            </p>
          )}
          {data && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Mục tiêu da">
              {data.goals.map((g) => {
                const on = selected.includes(g.code)
                return (
                  <button
                    key={g.code}
                    onClick={() => toggle(g.code)}
                    aria-pressed={on}
                    className={`rounded-full px-4 py-2 text-[0.9375rem] font-medium ring-1 ${
                      on ? 'bg-ink text-white ring-ink' : 'bg-surface text-ink-soft ring-line hover:text-ink hover:ring-ink/30'
                    }`}
                  >
                    {g.name_vi}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {data && chosen.length === 0 && (
        <p className="text-[0.9375rem] text-ink-soft">
          Chọn một hoặc vài mục tiêu để xem hoạt chất thường dùng và thông tin có nguồn.
        </p>
      )}

      {chosen.map((goal) => (
        <GoalSection key={goal.code} goal={goal} routine={routine} found={found} onOpen={setOpen} />
      ))}

      {data && chosen.length > 0 && data.shared_infos.length > 0 && (
        <section aria-labelledby="goals-shared">
          <h2 id="goals-shared" className="text-2xl leading-tight font-bold text-balance">
            Dùng chung cho mọi mục tiêu
          </h2>
          <ItemList items={data.shared_infos} routine={routine} found={found} onOpen={setOpen} />
        </section>
      )}

      <Dialog
        open={open !== null}
        onClose={() => setOpen(null)}
        title={<h2 className="text-xl leading-snug font-bold text-pretty">{open?.title_vi}</h2>}
      >
        {open && <ItemDetail item={open} routine={routine} found={found} />}
      </Dialog>
    </div>
  )
}

type ItemProps = { routine: Routine; found: Map<string, LabelGroups> }

function GoalSection({ goal, routine, found, onOpen }: ItemProps & { goal: Goal; onOpen: (i: GoalItem) => void }) {
  const id = `goal-${goal.code}`
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-2xl leading-tight font-bold text-balance">
        {goal.name_vi}
      </h2>
      <p className="mt-2 max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-soft">{goal.description_vi}</p>
      {goal.has_article && (
        <a
          href={href({ page: 'goal-article', code: goal.code })}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-surface px-4 py-2 text-sm font-medium text-link ring-1 ring-line hover:ring-ink/30"
        >
          Đọc bài đầy đủ<span aria-hidden="true">→</span>
        </a>
      )}
      {goal.actives.length === 0 && goal.infos.length === 0 ? (
        <p className="mt-4 text-sm text-ink-mute">Chưa có thông tin đã duyệt cho mục tiêu này.</p>
      ) : (
        <>
          {goal.actives.length > 0 && (
            <>
              <h3 className="mt-5 text-base font-semibold">Hoạt chất thường dùng</h3>
              <ItemList items={goal.actives} routine={routine} found={found} onOpen={onOpen} />
            </>
          )}
          {goal.infos.length > 0 && (
            <>
              <h3 className="mt-5 text-base font-semibold">Tìm hiểu thêm</h3>
              <ItemList items={goal.infos} routine={routine} found={found} onOpen={onOpen} />
            </>
          )}
        </>
      )}
    </section>
  )
}

function useInRoutine(item: GoalItem, routine: Routine): MyProduct[] {
  const groups = useContext(GroupsContext)
  return item.group ? productsWithGroup(routine, item.group, groups) : []
}

function ItemList({ items, routine, found, onOpen }: ItemProps & { items: GoalItem[]; onOpen: (i: GoalItem) => void }) {
  return (
    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.key}>
          <ItemButton item={item} routine={routine} found={found} onOpen={() => onOpen(item)} />
        </li>
      ))}
    </ul>
  )
}

function ItemButton({ item, routine, found, onOpen }: ItemProps & { item: GoalItem; onOpen: () => void }) {
  const name = useGroupName()
  const inRoutine = useInRoutine(item, routine)
  return (
    <button
      onClick={onOpen}
      aria-haspopup="dialog"
      className="flex h-full w-full flex-col items-start gap-2 rounded-xl bg-surface p-4 text-left ring-1 ring-line hover:ring-ink/30"
    >
      {item.group && (
        <span className="rounded-full bg-active px-2 py-px text-xs font-medium text-active-ink">{name(item.group)}</span>
      )}
      <span className="text-[0.9375rem] leading-snug font-semibold text-pretty">{item.title_vi}</span>
      {item.group && inRoutine.length > 0 && <InRoutine group={item.group} products={inRoutine} found={found} />}
      <span className="mt-auto text-sm text-link">Đọc chi tiết và nguồn</span>
    </button>
  )
}

const AMOUNT_NOTE =
  'Bảng thành phần không ghi nồng độ, nên có chất thuộc nhóm này không có nghĩa là routine đã đủ lượng cho mục tiêu.'

/**
 * Matched by group, not by ingredient: an item about one acid also matches a product with
 * another acid of its group, so the label names the group. After a routine check, each product
 * names the label lines in the group and where they are on the label.
 */
function InRoutine({ group, products, found }: { group: string; products: MyProduct[]; found: Map<string, LabelGroups> }) {
  const name = useGroupName()
  return (
    <span className="text-xs leading-snug break-words text-ink-soft">
      <span className="font-semibold text-ink">Routine có sản phẩm chứa chất thuộc nhóm {name(group)}:</span>{' '}
      {products.map((p) => p.name + labelLines(group, found.get(p.key))).join(', ')}
    </span>
  )
}

/** " (Lactobionic Acid, dòng 29/41)"; empty before a check or when no line is in the group. */
function labelLines(group: string, product: LabelGroups | undefined): string {
  if (!product) return ''
  const lines = product.ingredients.filter((i) => i.group === group)
  if (lines.length === 0) return ''
  const parts = lines.map((l) => (product.ordered ? `${l.name}, dòng ${l.position}/${product.count}` : l.name))
  return ` (${parts.join('; ')})`
}

/** The item exactly as reviewed: title and body verbatim, with every source and its quote. */
function ItemDetail({ item, routine, found }: ItemProps & { item: GoalItem }) {
  const name = useGroupName()
  const inRoutine = useInRoutine(item, routine)
  return (
    <article>
      {item.group && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="rounded-full bg-active px-2 py-px text-xs font-medium text-active-ink">{name(item.group)}</span>
          {inRoutine.length > 0 && <InRoutine group={item.group} products={inRoutine} found={found} />}
        </div>
      )}
      {item.group && inRoutine.length > 0 && <p className="mt-2 text-xs leading-snug text-ink-mute">{AMOUNT_NOTE}</p>}
      <p className="mt-3 text-[0.9375rem] leading-relaxed whitespace-pre-line text-ink-soft">{item.body_vi}</p>
      <SourceList sources={item.sources} />
    </article>
  )
}

function SourceList({ sources }: { sources: Source[] }) {
  return (
    <section className="mt-5 border-t border-line pt-3">
      <h3 className="text-sm font-semibold">Nguồn ({sources.length} đoạn trích)</h3>
      <ul className="mt-3 space-y-4">
        {sources.map((s, i) => (
          <li key={i}>
            <blockquote className="border-l-2 border-ink/20 pl-3 font-serif text-[0.9375rem] leading-relaxed text-ink-soft italic">
              “{s.quote}”
            </blockquote>
            <p className="mt-1.5 pl-3.5 text-xs leading-snug">
              <a href={s.url} target="_blank" rel="noreferrer" className="text-link underline-offset-2 hover:underline">
                {s.title}
              </a>
              <span className="block text-ink-mute">{s.publisher}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
