export function getYearlyRange(): { firstDay: string; lastDay: string } {
    const now = new Date();

    // First day of current year → Jan 1
    const first = new Date(now.getFullYear(), 0, 1);

    // Last day of current year → Dec 31
    const last = new Date(now.getFullYear(), 11, 31);

    const firstDay = formatDate(first);
    const lastDay = formatDate(last);

    return ({firstDay, lastDay});
}

export function getMonthRange(): { firstDay: string; lastDay: string } {
    const now = new Date();

    const firstDay = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const lastDay = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    return ({firstDay, lastDay});
}

export function getWeeklyRange(): { firstDay: string; lastDay: string } {
    const now = new Date();

    // JS weeks start on Sunday (0), so convert to Monday-based
    const dayOfWeek = now.getDay();          // 0 (Sun) → 6, 1 (Mon) → 0, etc.
    const diffToMonday = (dayOfWeek + 6) % 7;

    // First day = Monday
    const first = new Date(now);
    first.setDate(now.getDate() - diffToMonday);

    // Last day = Sunday
    const last = new Date(first);
    last.setDate(first.getDate() + 6);

    const firstDay = formatDate(first);
    const lastDay = formatDate(last);

    return ({firstDay, lastDay});
}

function padNumber(num: any): string {
    return num.toString().padStart(2, "0");
}

function formatDate(date: any) {
    const year = date.getFullYear();
    const month = padNumber(date.getMonth() + 1);
    const day = padNumber(date.getDate());
    return `${year}-${month}-${day}`;
}
