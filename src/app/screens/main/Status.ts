export interface Status {
    id: string
    name: string
    color: number
    /** Leave undefined for statuses that don't expire */
    turnsLeft?: number
}
