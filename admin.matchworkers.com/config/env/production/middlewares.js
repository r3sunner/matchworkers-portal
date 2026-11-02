/** @param {{ env: (key: string) => string | undefined }} ctx */
// ignore error: this is not an error
module.exports = ({ env }) => {
    const awsBucket = env('AWS_BUCKET');
    const awsRegion = env('AWS_REGION');

    const s3Url =
        awsBucket && awsRegion
            ? `https://${awsBucket}.s3.${awsRegion}.amazonaws.com`
            : null;

    return [
        'strapi::logger',
        'strapi::errors',

        {
            name: 'strapi::security',
            config: {
                contentSecurityPolicy: {
                    useDefaults: true,
                    directives: {
                        'connect-src': [
                            "'self'",
                            'https:',
                        ],

                        'img-src': [
                            "'self'",
                            'data:',
                            'blob:',
                            'market-assets.strapi.io',

                            // AWS S3 bucket
                            ...(s3Url ? [s3Url] : []),
                        ],

                        'media-src': [
                            "'self'",
                            'data:',
                            'blob:',

                            // AWS S3 bucket
                            ...(s3Url ? [s3Url] : []),
                        ],

                        upgradeInsecureRequests: null,
                    },
                },
            },
        },

        {
            name: 'strapi::cors',
            config: {
                origin: [
                   
                    'http://187.124.115.4:3000',

                    'https://jobportal.matchworkers.com',
                    'https://www.jobportal.matchworkers.com',
                    
           
                ],

                methods: [
                    'GET',
                    'POST',
                    'PUT',
                    'PATCH',
                    'DELETE',
                    'OPTIONS',
                ],

                headers: [
                    'Content-Type',
                    'Authorization',
                    'Origin',
                    'Accept',
                    'Strapi-Response-Format',
                ],

                credentials: false,
                keepHeaderOnError: true,
            },
        },

        'strapi::poweredBy',
        'strapi::query',
        'strapi::body',
        'strapi::session',
        'strapi::favicon',
        'strapi::public',
    ];
};