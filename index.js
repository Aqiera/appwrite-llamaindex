const { Client, Storage, Databases, ID } = require("appwrite");
const fetch = require("node-fetch"); // Import node-fetch
const FormData = require("form-data"); // Import form-data
const XLSX = require("xlsx");
const MarkdownIt = require("markdown-it");

module.exports = async function (context) {
  const client = new Client()
    .setEndpoint(context.env["APPWRITE_ENDPOINT"])
    .setProject(context.env["APPWRITE_PROJECT"])
    .setKey(context.env["APPWRITE_API_KEY"]);

  const storage = new Storage(client);
  const databases = new Databases(client);

  try {
    const fileId = context.req.body.fileId;
    const userId = context.req.body.userId;

    // Fetch the file from Appwrite storage
    const file = await storage.getFileView(fileId);
    const fileBuffer = Buffer.from(file); // Convert the file to a Buffer

    // LlamaCloud API endpoint and API key
    const llamaCloudApiUrl = context.env["LLAMA_CLOUD_API_ENDPOINT"];
    const llamaCloudApiKey = context.env["LLAMA_CLOUD_API_KEY"];

    // Prepare form data for the request
    const formData = new FormData();
    formData.append("file", new Blob([fileBuffer]), "document"); // 'document' is arbitrary and can be adjusted if needed

    // Call LlamaCloud API using HTTP request
    const llamaCloudResponse = await fetch(llamaCloudApiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${llamaCloudApiKey}`, // Include API key in the header
      },
      body: formData,
    });

    if (!llamaCloudResponse.ok) {
      throw new Error(
        `LlamaCloud API error: ${llamaCloudResponse.status} ${llamaCloudResponse.statusText}`
      );
    }

    const parsedData = await llamaCloudResponse.json(); // Assuming JSON response

    let markdownOutput = "";
    let xlsxOutput = null;

    if (parsedData.tables && parsedData.tables.length > 0) {
      // Convert tables to XLSX
      const workbook = XLSX.utils.book_new();
      parsedData.tables.forEach((table, index) => {
        const sheet = XLSX.utils.json_to_sheet(table);
        XLSX.utils.book_append_sheet(workbook, sheet, `Table ${index + 1}`);
      });
      xlsxOutput = XLSX.write(workbook, { bookType: "xlsx", type: "base64" });
    } else {
      // Convert text to Markdown
      const md = new MarkdownIt();
      markdownOutput = md.render(parsedData.text);
    }

    // Store the results in Appwrite database
    await databases.createDocument(
      context.env["APPWRITE_DATABASE_ID"],
      context.env["APPWRITE_COLLECTION_ID"],
      ID.unique(),
      {
        userId: userId,
        documentId: fileId,
        markdownOutput: markdownOutput,
        xlsxOutput: xlsxOutput,
      }
    );

    return context.res.json({
      success: true,
      message: "Document parsed and stored successfully.",
    });
  } catch (error) {
    console.error("Error parsing document:", error);
    return context.res.json({
      success: false,
      error: error.message,
    });
  }
};
