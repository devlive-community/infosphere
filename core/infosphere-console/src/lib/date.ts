export function calculateDaysBetweenDates(date1: string | Date, date2: string | Date): number
{
    const startDate = new Date(date1)
    const endDate = new Date(date2)
    const differenceInTime = endDate.getTime() - startDate.getTime()
    const differenceInDays = differenceInTime / (1000 * 3600 * 24)
    return Math.round(differenceInDays)
}
