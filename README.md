# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Supabase backend

The React app uses the `pos-api` Edge Function at
`<project URL>/functions/v1/pos-api` when `REACT_APP_SUPABASE_URL` is set.
Copy `.env.example` to `.env.local` for local development. Set the same
`REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_PUBLISHABLE_KEY` build
variables in your frontend host. The existing `REACT_APP_API_URL` override
still works when the Supabase URL is unset.

The Edge Function keeps the existing POS endpoints and session format. It uses
Supabase Postgres for records and Supabase Storage for new product images.
The public menu can read products, categories, and promotions. Staff and
admin routes check POS bearer tokens. Daily order numbers follow UTC, matching
the previous backend's default server timezone.

### Deploy the database and Edge Function

Sign in to the Supabase CLI and run these commands from this repository.

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --remote
supabase secrets set --env-file supabase/.env.production
supabase functions deploy pos-api
```

In the ignored `supabase/.env.production` file, set the backend's
`ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_SECRET`. Reusing the current secrets
keeps active sessions valid. Preserve `SENDGRID_API_KEY`, `MAIL_FROM`,
`MAIL_REPLY_TO`, and `ADMIN_EMAIL` for receipts and PIN emails. Set
`FRONTEND_ORIGIN` to your frontend origin, with comma-separated origins if you
have several. The function uses the Supabase-provided database URL by default.
To use a pooler connection, set the backend-only `POS_DATABASE_URL`. Keep
database credentials, JWT secrets, and SendGrid credentials in server-side
configuration. [Supabase deployment](https://supabase.com/docs/guides/functions/deploy) ·
[Supabase function secrets](https://supabase.com/docs/guides/functions/secrets)

For signed QZ Tray printing, set the Edge Function's `POS_QZ_SIGNER_URL` and the
frontend's `REACT_APP_QZ_CERTIFICATE_URL` to the matching signer and public
certificate. Without those settings, QZ Tray uses its default unsigned-print
flow.

### Import existing records and switch traffic

1. Prepare a fresh Supabase POS schema and verify
   `GET /functions/v1/pos-api/health`. Before the production import, back up
   MongoDB and pause writes to the old POS backend.
2. Create the ignored file `supabase/.env.import` with `MONGODB_URI` and
   `POS_IMPORT_DATABASE_URL`. If the MongoDB URI needs a separate database
   name, set `MONGODB_DATABASE`. For the destination, use the Supabase direct
   or session-pooler connection string with TLS. Run the import from this
   repository.

   ```sh
   deno run --node-modules-dir=none --allow-env --allow-net --allow-sys=osRelease \
     --env-file=supabase/.env.import supabase/scripts/import-mongo.js
   ```

3. Compare the import counts against MongoDB. The importer commits all
   collections together, preserves record IDs and password hashes, and seeds
   the daily order counters. It refuses to overwrite a populated target.
4. Use a preview build configured for Supabase to confirm that the public menu
   loads with its existing images, an existing staff account can sign in, and a
   controlled checkout can print and email a receipt. If any stored image links still use
   the old backend host, move those images to Supabase Storage and update their
   product links before retiring the service.
5. Set the frontend build variables and redeploy. Keep the old deployment
   available during verification. Once the Supabase POS accepts new orders,
   reconcile any new records before switching traffic back.

## Boonz membership

- Admins configure earning and product rewards under **Membership → Points and rewards**. The default is 1 point per full Rp10.000 paid. Only rewards configured and enabled by an admin appear at checkout.
- Under **Membership → Cashier access**, admins approve existing cashier accounts that should handle member information. Members provide their name, email, and phone number at enrollment.
- At checkout, select **Add a member**, then look up their email or phone number. Choose an available reward if requested. Use **Redeem reward** with an empty cart for a rewards-only order.
- Member receipts are emailed automatically and show earned points, redeemed points, and the balance after checkout. A cancellation or refund reverses that order’s points. If the member has already spent the earned points, future earnings first make up the shortfall.

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
