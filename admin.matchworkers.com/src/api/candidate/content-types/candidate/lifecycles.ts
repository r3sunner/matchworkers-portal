
module.exports = {
    beforeCreate(event) {
        event.params.data.type = "candidate";
    },

    beforeUpdate(event) {
        // keep it fixed even if someone tries to change it
        event.params.data.type = "candidate";
    },

    afterUpdate(event) {
        // Safety hook (no DB write here as you requested)
        // You can keep it empty or add logs if needed
    },
};