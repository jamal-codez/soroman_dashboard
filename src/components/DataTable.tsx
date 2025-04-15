import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  SortingState,
  ColumnDef,
} from '@tanstack/react-table';
import { useState } from 'react';
import { ArrowUp, ArrowDown, Search } from 'lucide-react';

interface DataTableProps<T extends object> {
  data: T[];
  columns: ColumnDef<T, any>[];
  isLoading?: boolean;
  enableSearch?: boolean;
  searchPlaceholder?: string;
  enablePagination?: boolean;
  enableSorting?: boolean;
  noDataMessage?: string;
  onRowClick?: (row: T) => void;
  viewButtonText?: string;
}

export function DataTable<T extends object>({
  data,
  columns,
  isLoading = false,
  enableSearch = true,
  searchPlaceholder = "Search...",
  enablePagination = true,
  enableSorting = true,
  noDataMessage = "No data available",
  onRowClick,
  viewButtonText = "View",
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data: Array.isArray(data) ? data : [],
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableSorting,
  });

  return (
    <div className="w-full p-4 bg-slate-50 rounded-xl">
      {/* Search Input */}
      {enableSearch && (
        <div className="flex justify-end mb-4">
          <div className="relative w-full max-w-md">
            <input
              type="text"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-soroman-orange/50 bg-white"
            />
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
        {isLoading && (
          <div className="h-1 bg-slate-200 animate-pulse">
            <div className="h-full bg-soroman-orange w-1/2 transition-all duration-300" />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-soroman-blue text-white">
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wider">
                    SN
                  </th>
                  {headerGroup.headers.map(header => (
                    <th
                      key={header.id}
                      className={`px-4 py-3 text-left text-sm font-semibold uppercase tracking-wider ${
                        enableSorting && header.column.getCanSort() 
                          ? 'cursor-pointer hover:bg-soroman-orange/20' 
                          : ''
                      }`}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {enableSorting && header.column.getCanSort() && (
                          <span className="ml-1">
                            {{
                              asc: <ArrowUp className="h-4 w-4" />,
                              desc: <ArrowDown className="h-4 w-4" />,
                            }[header.column.getIsSorted() as string] ?? (
                              <span className="text-transparent">↕</span>
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                  {onRowClick && (
                    <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              ))}
            </thead>

            <tbody className="divide-y divide-slate-200">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td 
                    colSpan={columns.length + 1}
                    className="px-4 py-12 text-center text-slate-500"
                  >
                    {noDataMessage}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={`hover:bg-slate-50 ${
                      index % 2 === 0 ? 'bg-slate-50' : 'bg-white'
                    }`}
                  >
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {index + 1}
                    </td>
                    {row.getVisibleCells().map(cell => (
                      <td
                        key={cell.id}
                        className="px-4 py-3 text-sm text-slate-700"
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                    {onRowClick && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onRowClick(row.original)}
                          className="px-3 py-1.5 text-sm font-medium text-soroman-blue hover:text-white hover:bg-soroman-blue rounded-md border border-soroman-blue transition-colors"
                        >
                          {viewButtonText}
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {enablePagination && (
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
            <div className="flex-1 flex items-center gap-4">
              <span className="text-sm text-slate-700">
                Page {table.getState().pagination.pageIndex + 1} of{' '}
                {table.getPageCount()}
              </span>
              
              <select
                value={table.getState().pagination.pageSize}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
                className="px-2 py-1 border rounded-md text-sm"
              >
                {[5, 10, 25, 50].map((size) => (
                  <option key={size} value={size}>
                    Show {size}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 rounded-md border border-slate-300"
              >
                Previous
              </button>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 rounded-md border border-slate-300"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}