# GhostProtocol Backend

## Why MongoDB?

For **GhostProtocol**, MongoDB is the ideal database choice for several critical reasons:

1.  **Flexible Schema (NoSQL):** Social media data is unstructured and evolves rapidly. Posts might have images today, videos tomorrow, and polls next week. MongoDB allows us to update the data model without complex migrations.
2.  **JSON-Native:** Our frontend is React (JavaScript), and our backend is Node.js. MongoDB stores data as BSON (Binary JSON), meaning the data flows seamlessly from Database -> Backend -> Frontend without complex ORM mapping.
3.  **Scalability:** MongoDB handles large volumes of read/write operations efficiently, which is crucial for a social feed, messaging, and notifications.
4.  **Embedded Documents:** We can embed `comments` or `reactions` directly within a `Post` document for faster read performance (rendering a feed in one query), or reference them as needed.

## Persistence Architecture

Data persistence is handled by **MongoDB Atlas** (cloud) or a local MongoDB instance.
-   When you run the backend, it connects to the MongoDB database using a connection string.
-   Data is written to disk (or cloud storage).
-   Unlike `localStorage` (which is browser-only and wiped on clear), MongoDB retains data indefinitely until explicitly deleted.
-   We use **Mongoose** as an ODM (Object Data Modeling) library to enforce schemas and validation, ensuring inconsistent data doesn't enter our persistent storage.
