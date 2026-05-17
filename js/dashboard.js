// Dashboard Module
const Dashboard = {
    async load() {
        try {
            const result = await API.getStaff();
            if (result.status === 'success') {
                const activeCount = result.staff.filter(s => s.status === 'active').length;
                document.getElementById('activeStaffCount').textContent = activeCount;
            }
        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
    }
};
