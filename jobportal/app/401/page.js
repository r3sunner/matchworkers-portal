import Link from "next/link";

export default function UnauthorizedPage() {
    return (
        <main className="min-h-[calc(100vh-85px)] bg-gray-50 px-3 flex items-center justify-center ">
            <section className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
                <div className="text-6xl font-bold text-red-700">401</div>
                <h1 className="mt-4 text-2xl font-semibold text-gray-900">
                    Unauthorized access
                </h1>
                <p className="mt-2 text-sm text-gray-600">
                    Your account does not have permission to open this page.
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-3 hidden">
                    <Link
                        href="/"
                        className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                        Go to Home
                    </Link>
                    <Link
                        href="/login/"
                        className="rounded-xl bg-red-700 px-4 py-2 text-sm text-white hover:opacity-90"
                    >
                        Login with another account
                    </Link>
                </div>
            </section>
        </main>
    );
}
