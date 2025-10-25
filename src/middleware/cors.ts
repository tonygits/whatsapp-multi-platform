import cors from 'cors';

// Add a list of allowed origins.
// If you have more origins you would like to add, you can add them to the array below.
const options: cors.CorsOptions = {
    origin: ['*'],
    methods: ['POST', 'OPTIONS', 'GET', 'PUT', 'DELETE'],
    allowedHeaders: ['*'],
    exposedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-TOKEN', 'X-Requested-With', 'X-CLIENT-IDENTIFIER', 'X-CLIENT-VERSION'],
    credentials: true,
};

export default options;
