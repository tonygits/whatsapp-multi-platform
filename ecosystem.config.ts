module.exports = {
    apps: [
        {
            name: 'api-gateway',
            script: 'npm',
            args: 'start',
        },
        {
            name: 'rabbitmq-consumer',
            script: 'node',
            args: 'dist/src/rabbitmq/consumer.js',
        },
        {
            name: 'rabbitmq-producer',
            script: 'node',
            args: 'dist/src/rabbitmq/producer.js',
        }
    ]
};
