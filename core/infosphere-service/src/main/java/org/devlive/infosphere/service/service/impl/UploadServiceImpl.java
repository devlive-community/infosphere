package org.devlive.infosphere.service.service.impl;

import lombok.extern.slf4j.Slf4j;
import org.devlive.infosphere.common.response.CommonResponse;
import org.devlive.infosphere.common.utils.CodeUtils;
import org.devlive.infosphere.common.utils.IOUtils;
import org.devlive.infosphere.common.utils.UrlUtils;
import org.devlive.infosphere.service.body.UploadBody;
import org.devlive.infosphere.service.security.UserDetailsService;
import org.devlive.infosphere.service.service.UploadService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.servlet.http.HttpServletRequest;

import java.io.File;
import java.io.IOException;

import static java.util.Objects.requireNonNull;

@Slf4j
@Service
public class UploadServiceImpl
        implements UploadService
{
    @Value(value = "${infosphere.cache.home}")
    private String home;

    private final HttpServletRequest request;

    public UploadServiceImpl(HttpServletRequest request)
    {
        this.request = request;
    }

    @Override
    public CommonResponse<Object> upload(UploadBody configure)
    {
        boolean successful = false;
        configure.setCode(CodeUtils.generateCode(false));
        String targetPath = String.join(".", UrlUtils.fixUrl(String.join(File.separator, String.join(File.separator, getHome(configure)))), "png");
        try {
            successful = IOUtils.copy(configure.getFile().getInputStream(), targetPath, true);
        }
        catch (IOException e) {
            log.error("Failed to upload file [ {} ]", configure.getCode(), e);
            return CommonResponse.failure(e.getMessage());
        }
        finally {
            try {
                configure.getFile()
                        .getInputStream()
                        .close();
            }
            catch (IOException e) {
                log.warn("Failed to close input stream", e);
            }
        }
        if (successful) {
            return CommonResponse.success(getAccess(targetPath));
        }
        return CommonResponse.failure("Failed to upload file");
    }

    /**
     * Returns the home directory path based on the given configuration.
     *
     * @param configure the upload configuration containing the mode and code
     * @return the home directory path
     */
    private String getHome(UploadBody configure)
    {
        return String.join(File.separator, home,
                requireNonNull(UserDetailsService.getUser()).getUsername()
                        .split("@")[0]
                        .toLowerCase(),
                configure.getMode().toLowerCase(),
                configure.getCode());
    }

    /**
     * Returns the access URL for the given AvatarEntity.
     *
     * @param path The path
     * @return the access URL
     */
    private String getAccess(String path)
    {
        String protocol = request.getScheme();
        String host = request.getServerName();
        int port = request.getServerPort();
        return String.join(File.separator, protocol + "://" + host + ":" + port, UrlUtils.fixUrl(String.join(File.separator, "upload", path)));
    }
}
