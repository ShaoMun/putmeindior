import ee from "@google/earthengine";

let initPromise: Promise<typeof ee> | null = null;

export function getEE(): Promise<typeof ee> {
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    const email = process.env.GEE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GEE_PRIVATE_KEY;

    if (!email || !key) {
      reject(new Error("Missing GEE_SERVICE_ACCOUNT_EMAIL or GEE_PRIVATE_KEY in env"));
      initPromise = null;
      return;
    }

    const credentials = {
      client_email: email,
      private_key: key.replace(/\\n/g, "\n"),
    };

    ee.data.authenticateViaPrivateKey(
      credentials,
      () => {
        ee.initialize(
          null,
          null,
          () => resolve(ee),
          (err: Error) => {
            initPromise = null;
            reject(err);
          }
        );
      },
      (err: Error) => {
        initPromise = null;
        reject(err);
      }
    );
  });

  return initPromise;
}

// Helper: wrap EE callback-based evaluate/getThumbURL into a Promise
export function eeEval(eeObj: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof eeObj === "string") {
      resolve(eeObj);
    } else if (typeof eeObj.evaluate === "function") {
      eeObj.evaluate((result: any, err: any) => {
        if (err) reject(new Error(String(err)));
        else resolve(result);
      });
    } else if (typeof eeObj.getInfo === "function") {
      eeObj.getInfo((result: any, err: any) => {
        if (err) reject(new Error(String(err)));
        else resolve(result);
      });
    } else {
      resolve(eeObj);
    }
  });
}

export function eeThumbUrl(image: any, params: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const result = image.getThumbURL(params, (url: string, err: any) => {
      if (err) reject(new Error(String(err)));
      else resolve(url);
    });
    // Some versions return the URL synchronously
    if (typeof result === "string") resolve(result);
  });
}

// Shared constants for Kuala Lumpur
export const KL_LON = 101.6869;
export const KL_LAT = 3.1390;
