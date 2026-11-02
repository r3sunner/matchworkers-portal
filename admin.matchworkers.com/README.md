# MatchWorkers Strapi Backend

This is a custom Strapi backend application designed, configured, and modified specifically for **MatchWorkers**.

The application provides backend services, APIs, content management, authentication, database integration, file management, and other administrative functionality required by the MatchWorkers platform.

## Requirements

Before installing the application, make sure the server has:

* Node.js
* npm
* A supported database such as MySQL or MariaDB
* Required environment variables
* Access to any configured storage service, email provider, or external API

## Installation

Install the project dependencies:

```bash
npm install
```

Create and configure the required environment variables in the `.env` file.

Example:

```env
HOST=0.0.0.0
PORT=1337

APP_KEYS=
API_TOKEN_SALT=
ADMIN_JWT_SECRET=
TRANSFER_TOKEN_SALT=
JWT_SECRET=

DATABASE_CLIENT=mysql
DATABASE_HOST=
DATABASE_PORT=3306
DATABASE_NAME=
DATABASE_USERNAME=
DATABASE_PASSWORD=
```

Additional environment variables may be required depending on the project configuration.

## Development

Run the Strapi development server:

```bash
npm run develop
```

The Strapi administration panel is normally available at:

```text
http://localhost:1337/admin
```

## Production Build

Build the Strapi administration panel:

```bash
npm run build
```

Start the production server:

```bash
npm run start
```

## Security

Do not commit sensitive information to the Git repository, including:

* Database passwords
* API keys
* AWS access keys
* JWT secrets
* Strapi application keys
* Email service credentials
* Backup credentials
* Production environment files

Keep all production secrets inside a secure `.env` file or an approved secret-management system.

The `.env` file should be excluded through `.gitignore`.

## License and Usage Restrictions

This Strapi project, including its custom source code, configurations, APIs, content types, controllers, services, policies, middleware, extensions, scripts, and integrations, was designed and modified specifically for **MatchWorkers**.

MatchWorkers is authorized to:

* Use the application for MatchWorkers business operations.
* Install and run the application on servers owned, leased, or authorized by MatchWorkers.
* Modify and maintain the source code according to MatchWorkers requirements.
* Create backups of the application, database, configuration, and source code.
* Allow authorized employees, developers, contractors, and hosting providers to access the project when required for MatchWorkers development, maintenance, support, or deployment.
* Create staging, testing, development, and production copies exclusively for MatchWorkers operations.

The following activities are prohibited without prior written authorization from the software owner or developer:

* Selling or reselling the application or source code.
* Licensing, sublicensing, renting, or leasing the application to another person, organization, or company.
* Distributing or sharing the complete source code with unauthorized third parties.
* Providing copies of the application to another business.
* Reusing the custom project to build a similar system for another company.
* Deploying the application for any business other than MatchWorkers.
* Publishing the source code in a public Git repository.
* Providing the application as a white-label product.
* Offering the application as a hosted service or Software-as-a-Service product to third parties.
* Copying the custom APIs, database structure, content types, business logic, or administrative functionality for another commercial project.
* Removing or modifying copyright, ownership, or licence notices.
* Claiming ownership or independent authorship of the custom project.
* Transferring the project to another company during a sale, partnership, merger, outsourcing arrangement, or service agreement without written authorization.

Authorized developers, employees, contractors, hosting providers, and service providers may access the source code only when necessary to perform approved work for MatchWorkers.

Access to the source code does not provide any right to:

* Sell the application.
* Redistribute the application.
* Use the application for another customer.
* Create a competing product.
* Publish the source code.
* Grant access to another party.
* Claim ownership of the application.

Any modification, customization, update, integration, extension, or derivative version of this project remains subject to the same usage and distribution restrictions.

MatchWorkers must take reasonable steps to protect the source code, credentials, database, backups, and other confidential project information from unauthorized access or distribution.

Unauthorized copying, resale, publication, distribution, transfer, sublicensing, deployment, or commercial use of this custom software is strictly prohibited.

## Third-Party Software

This project is built using Strapi and may include other open-source packages and third-party dependencies.

Strapi and each third-party package remain subject to their own respective licences.

The restrictions in this document apply to the custom MatchWorkers project code, configurations, integrations, database structures, business logic, scripts, and modifications. They do not replace or override the licences of Strapi or any third-party dependency.

## Ownership

Unless otherwise agreed in a separate signed written contract, ownership of the custom source code remains with its legal owner or developer.

MatchWorkers receives a restricted right to use and modify the application solely for its own authorized business operations.

No ownership, resale, redistribution, sublicensing, or third-party deployment rights are granted by providing access to the source code.

## Confidentiality

The source code, database structure, API architecture, environment configuration, credentials, deployment information, business rules, and internal documentation should be treated as confidential information.

They must not be disclosed to any unauthorized individual, developer, organization, or company.

## Disclaimer

The software is provided for authorized MatchWorkers use.

The software owner or developer is not responsible for damage, data loss, security incidents, service interruption, or other issues caused by:

* Unauthorized modification.
* Incorrect deployment.
* Misconfigured servers.
* Exposed credentials.
* Unsupported third-party packages.
* Failure to maintain backups.
* Use of the application outside its authorized purpose.

**This is proprietary custom software and is not released as an open-source MatchWorkers project.**

**All rights reserved.**
