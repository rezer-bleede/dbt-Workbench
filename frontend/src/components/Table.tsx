import { ReactNode } from 'react'

interface Column<T> {
  key: keyof T | string
  header: string
  render?: (item: T) => ReactNode
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (item: T) => void
}

export function Table<T>({ columns, data, onRowClick }: TableProps<T>) {
  return (
    <div className="panel-table overflow-x-auto rounded-xl scrollbar-thin">
      <table className="min-w-full divide-y divide-border">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-text-tertiary bg-widget-header-bg whitespace-nowrap"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((item, idx) => (
            <tr
              key={idx}
              className={`transition-colors hover:bg-bg-hover/50 ${onRowClick ? 'cursor-pointer' : ''}`}
              onClick={() => onRowClick?.(item)}
            >
              {columns.map((col) => (
                <td key={String(col.key)} className="px-4 py-3 text-sm text-text-primary">
                  {col.render ? col.render(item) : (item as any)[col.key as string]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
