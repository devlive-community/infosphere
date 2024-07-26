package org.devlive.infosphere.service.entity;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonIncludeProperties;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;
import org.devlive.infosphere.service.common.StateEnum;
import org.devlive.infosphere.service.converter.FieldConverter;
import org.hibernate.annotations.Formula;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import javax.persistence.Column;
import javax.persistence.Convert;
import javax.persistence.Entity;
import javax.persistence.EntityListeners;
import javax.persistence.EnumType;
import javax.persistence.Enumerated;
import javax.persistence.FetchType;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.JoinTable;
import javax.persistence.ManyToOne;
import javax.persistence.Table;
import javax.persistence.Transient;

import java.time.Instant;

@Data
@ToString
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "infosphere_book")
@EntityListeners(AuditingEntityListener.class)
public class BookEntity
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "name")
    private String name;

    @Column(name = "cover")
    private String cover;

    @Column(name = "identify")
    private String identify;

    @Column(name = "description")
    private String description;

    @Column(name = "visibility")
    private Boolean visibility = true;

    @Column(name = "state")
    @Enumerated(EnumType.STRING)
    private StateEnum state = StateEnum.STARTED;

    @Column(name = "originate")
    @Convert(converter = FieldConverter.class)
    private FieldEntity originate;

    @Column(name = "create_time")
    @CreatedDate
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private Instant createTime;

    @Column(name = "update_time")
    @LastModifiedDate
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private Instant updateTime;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinTable(name = "infosphere_book_user_relation",
            joinColumns = @JoinColumn(name = "book_id"),
            inverseJoinColumns = @JoinColumn(name = "user_id"))
    @JsonIncludeProperties(value = {"id", "aliasName", "avatar", "email", "username"})
    private UserEntity user;

    @Formula(value = "(SELECT COUNT(d.id) " +
            "FROM infosphere_document d " +
            "LEFT JOIN infosphere_document_book_relation dbr ON dbr.document_id = d.id " +
            "WHERE dbr.book_id = id)")
    private Long documentCount;

    @Formula(value = "(SELECT COUNT(v.id) " +
            "FROM infosphere_access v " +
            "LEFT JOIN infosphere_access_book_relation abr ON abr.access_id = v.id " +
            "WHERE abr.book_id = id)")
    private Long visitorCount;

    @Transient
    private Boolean isFollowed;
}
