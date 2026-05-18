// Dashboard Module
const Dashboard = {
    async load() {
        try {
            const [staffRes, billsRes] = await Promise.all([
                API.getStaff(),
                API.getBills()
            ]);

            if (staffRes.status === 'success') {
                const activeCount = (staffRes.staff || []).filter(s => s.status === 'active').length;
                const el = document.getElementById('activeStaffCount');
                if (el) el.textContent = activeCount;
            }

            if (billsRes.status === 'success') {
                const today = new Date().toDateString();
                const todayBills = (billsRes.bills || []).filter(b => {
                    if (b.status === 'voided') return false;
                    return new Date(b.date).toDateString() === today;
                });
                const revenue = todayBills.reduce((s, b) => s + (Number(b.grandTotal) || 0), 0);

                const revEl = document.getElementById('todayRevenue');
                const countEl = document.getElementById('todayBillCount');
                if (revEl) revEl.textContent = '₹' + revenue.toFixed(2);
                if (countEl) countEl.textContent = todayBills.length;
            }
        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
    }
};
