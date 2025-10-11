export const getPeriodStart = (period: 'week' | 'month' | 'year'): Date => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (period) {
        case 'week':
            const dayOfWeek = today.getDay(); // Sunday - 0, Monday - 1, ...
            const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust to start on Monday
            return new Date(today.setDate(diff));
        case 'month':
            return new Date(today.getFullYear(), today.getMonth(), 1);
        case 'year':
            return new Date(today.getFullYear(), 0, 1);
    }
};
