import UIKit
import Capacitor

/// The Capacitor web view controller with the page background in both appearances ("WallyBackground" in
/// Assets.xcassets), so nothing shows black or white around the page while it loads or where the shell insets it.
class WallyBridgeViewController: CAPBridgeViewController {
    static let background = UIColor(named: "WallyBackground") ?? UIColor.systemBackground

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        let color = WallyBridgeViewController.background
        view.backgroundColor = color
        webView?.backgroundColor = color
        webView?.scrollView.backgroundColor = color
        webView?.underPageBackgroundColor = color
    }
}
