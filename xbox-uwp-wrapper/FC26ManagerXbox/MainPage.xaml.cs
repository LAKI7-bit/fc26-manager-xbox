using System;
using Windows.System;
using Windows.UI.Core;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Navigation;

namespace FC26ManagerXbox
{
    public sealed partial class MainPage : Windows.UI.Xaml.Controls.Page
    {
        // Hosted web app URL
        private static readonly Uri StartUri = new Uri("https://fc26-manager-xbox.web.app/");

        public MainPage()
        {
            this.InitializeComponent();

            Loaded += (_, __) => NavigateHome();

            Web.NavigationStarting += (_, __) => Loading.Visibility = Windows.UI.Xaml.Visibility.Visible;
            Web.NavigationCompleted += (_, __) => Loading.Visibility = Windows.UI.Xaml.Visibility.Collapsed;
            Web.NewWindowRequested += (s, e) =>
            {
                // Keep everything in the same WebView
                e.Handled = true;
                if (e.Uri != null) Web.Navigate(e.Uri);
            };

            // Gamepad B (and other back signals) -> WebView back or exit
            Window.Current.CoreWindow.KeyDown += CoreWindow_KeyDown;
            SystemNavigationManager.GetForCurrentView().BackRequested += (_, args) =>
            {
                args.Handled = true;
                HandleBack();
            };
        }

        private void NavigateHome()
        {
            try
            {
                Web.Navigate(StartUri);
            }
            catch
            {
                // no-op
            }
        }

        private void CoreWindow_KeyDown(CoreWindow sender, KeyEventArgs args)
        {
            if (args.Handled) return;

            // Xbox controller back is typically GamepadB. Some remotes map to Escape/GoBack.
            if (args.VirtualKey == VirtualKey.GamepadB || args.VirtualKey == VirtualKey.GoBack || args.VirtualKey == VirtualKey.Escape)
            {
                args.Handled = true;
                HandleBack();
            }
        }

        private void HandleBack()
        {
            if (Web.CanGoBack)
            {
                Web.GoBack();
                return;
            }

            // If you prefer to always stay in-app, navigate home instead of exiting:
            // NavigateHome();

            // Default: exit app when there is no back stack
            Windows.UI.Xaml.Application.Current.Exit();
        }
    }
}
